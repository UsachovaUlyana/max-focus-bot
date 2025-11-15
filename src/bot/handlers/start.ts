/**
 * Обработчик команды /start и главного меню
 */

import { Context } from '@maxhub/max-bot-api';
import * as crypto from 'crypto';
import { db } from '../../storage';
import { User } from '../../types';
import { messages } from '../messages';
import { getMainMenuKeyboard, getPodControlKeyboard, getPomodoroKeyboard } from '../keyboards';
import { podService } from '../../services/pods';
import { pomodoroService } from '../../services/pomodoro';
import { PodStatus } from '../../types';

export async function handleStart(ctx: Context): Promise<void> {
  try {
    // Получаем или создаем пользователя
    const userId = ctx.user?.user_id;
    if (!userId) {
      await ctx.reply('Ошибка: не удалось определить пользователя');
      return;
    }

    const maxUserId = String(userId);
    let user = await db.getUserByMaxId(maxUserId);

    const isNewUser = !user;
    
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        maxUserId,
        name: ctx.user?.name || 'Пользователь',
        focusCoins: 0,
        totalPomodoros: 0,
        totalFocusMinutes: 0,
        completedTasks: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastActiveDate: new Date().toISOString(),
        achievements: [],
        createdAt: new Date()
      };

      await db.createUser(user);
    }

    // Проверяем наличие start payload для приглашения в Pod
    const payload = ctx.startPayload;
    if (payload && payload.startsWith('pod_')) {
      const inviteCode = payload.replace('pod_', '');
      
      const pod = await podService.findPodByInviteCode(inviteCode);
      
      if (pod) {
        try {
          // Проверяем что пользователь ещё не в Pod'е
          const alreadyJoined = pod.participants.some(p => p.userId === user.id);
          
          if (alreadyJoined) {
            await ctx.reply(
              `⚠️ Ты уже в этом Pod'е!\n\n` +
              `*${pod.title}*\n` +
              `👥 Участников: ${pod.participants.length}\n` +
              `⏱️ Длительность: ${pod.duration} минут`,
              {
                attachments: [getPodControlKeyboard(pod.id, user.id === pod.creatorId)],
                format: 'markdown'
              }
            );
            return;
          }
          
          // Присоединяемся к Pod
          const updatedPod = await podService.joinPod(pod.id, user.id, user.name);
          
          await ctx.reply(
            `✅ *Присоединился к Pod'у!*\n\n` +
            `*${updatedPod.title}*\n` +
            `👥 Участников: ${updatedPod.participants.length}\n` +
            `⏱️ Длительность: ${updatedPod.duration} минут\n` +
            `🎯 Создатель: ${updatedPod.participants.find(p => p.isCreator)?.userName}\n\n` +
            `Ожидаем начала сессии...`,
            {
              attachments: [getPodControlKeyboard(updatedPod.id, false)],
              format: 'markdown'
            }
          );
          return;
        } catch (error: any) {
          console.error('Error joining pod:', error);
          await ctx.reply(
            `❌ Не удалось присоединиться к Pod'у: ${error.message}\n\n` +
            `Возможно, сессия уже началась или завершилась.`
          );
        }
      } else {
        await ctx.reply(
          `❌ Pod с кодом \`${inviteCode}\` не найден.\n\n` +
          `Возможно, ссылка устарела или код неверный.`,
          { format: 'markdown' }
        );
      }
    }

    await db.setBotState({
      userId: user.id,
      chatId: String(ctx.chatId || userId),
      state: 'main_menu',
      updatedAt: new Date()
    });

    // Onboarding для новых пользователей
    if (isNewUser) {
      await ctx.reply(
        `👋 Привет, *${user.name}*!\n\n` +
        `Я *MAX Focus Pods* — твой помощник для продуктивности.\n\n` +
        `Что я умею:\n\n` +
        `⏱️ *Pomodoro-таймер*\nЗапускаю фокус-сессии 25/50/90 минут. Работаешь без отвлечений → получаешь награды\n\n` +
        `🤝 *Focus Pods*\nСоздавай совместные сессии с друзьями. Работаете вместе → бонусные награды\n\n` +
        `📋 *Умные задачи*\nПросто пиши "Сдать проект до 15.11" — я сам распознаю дедлайн. Могу распилить на подзадачи\n\n` +
        `🎮 *Gamification*\nFocusCoins за активность, достижения, серия дней — твоя мотивация расти\n\n` +
        `Начнём с первой задачи или фокус-сессии?`,
        {
          attachments: [getMainMenuKeyboard()],
          format: 'markdown'
        }
      );
      return;
    }

    await ctx.reply(messages.start, {
      attachments: [getMainMenuKeyboard()],
      format: 'markdown'
    });
  } catch (error) {
    console.error('Error in handleStart:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleBackToMenu(ctx: Context): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    
    if (!user) {
      await ctx.answerOnCallback({
        message: {
          text: messages.start,
          attachments: [getMainMenuKeyboard()],
          format: 'markdown'
        }
      });
      return;
    }
    
    // Проверяем активные сессии
    const activeSession = await pomodoroService.getActiveSession(user.id);
    const activePod = await podService.getUserActivePod(user.id);
    
    let statusText = messages.start;
    let keyboard = getMainMenuKeyboard();
    
    if (activeSession) {
      const info = await pomodoroService.getSessionInfo(activeSession.id);
      if (info) {
        const timeLeft = pomodoroService.formatRemainingTime(info.remainingMinutes, info.remainingSeconds);
        statusText += `\n\n🟢 *Активная фокус-сессия*\nОсталось: *${timeLeft}*`;
        keyboard = getPomodoroKeyboard(activeSession.id);
      }
    } else if (activePod && (activePod.status === PodStatus.ACTIVE || activePod.status === PodStatus.WAITING)) {
      const podTimeLeft = Math.max(0, activePod.duration - 
        Math.floor((Date.now() - (activePod.startTime?.getTime() || Date.now())) / 60000));
      const statusLabel = activePod.status === PodStatus.WAITING ? '🕓 Ожидание' : '🟢 Идёт';
      
      statusText += `\n\n${statusLabel} *Pod-сессия*\n` +
        `${activePod.title}\n` +
        `👥 ${activePod.participants.length} участников\n` +
        `⏱️ Осталось: ~${podTimeLeft} мин`;
      
      keyboard = getPodControlKeyboard(activePod.id, activePod.creatorId === user.id);
    }
    
    await ctx.answerOnCallback({
      message: {
        text: statusText,
        attachments: [keyboard],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleBackToMenu:', error);
    await ctx.reply(messages.error);
  }
}

