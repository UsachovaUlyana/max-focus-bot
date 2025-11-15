/**
 * Обработчики для Pomodoro сессий
 */

import { Context } from '@maxhub/max-bot-api';
import { db } from '../../storage';
import { pomodoroService } from '../../services/pomodoro';
import { podService } from '../../services/pods';
import { PodStatus, TaskAction } from '../../types';
import { messages } from '../messages';
import { 
  getPomodoroKeyboard, 
  getPomodoroCompleteKeyboard,
  getBackToMenuKeyboard,
  getPodControlKeyboard,
  getFocusDurationKeyboard
} from '../keyboards';

export async function handleFocusDurationSelect(ctx: Context): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      if (ctx.callback) {
        await ctx.answerOnCallback({ notification: 'Не удалось определить пользователя' });
      } else {
        await ctx.reply('Не удалось определить пользователя');
      }
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      const msg = 'Пользователь не найден. Отправьте /start';
      if (ctx.callback) {
        await ctx.answerOnCallback({ notification: msg });
      } else {
        await ctx.reply(msg);
      }
      return;
    }

    const activeSession = await pomodoroService.getActiveSession(user.id);
    const activePod = await podService.getUserActivePod(user.id);

    if (activeSession || activePod) {
      if (activeSession) {
        const info = await pomodoroService.getSessionInfo(activeSession.id);
        if (info) {
          const timeLeft = pomodoroService.formatRemainingTime(info.remainingMinutes, info.remainingSeconds);
          const msg = `⚠️ У тебя уже активная сессия. Осталось: ${timeLeft}`;
          if (ctx.callback) {
            await ctx.answerOnCallback({ notification: msg });
          } else {
            await ctx.reply(msg);
          }
        }
      } else if (activePod) {
        const podTimeLeft = Math.max(0, activePod.duration - 
          Math.floor((Date.now() - (activePod.startTime?.getTime() || Date.now())) / 60000));
        const msg = `⚠️ Ты в Pod-сессии (${podTimeLeft} мин). Сначала заверши её.`;
        if (ctx.callback) {
          await ctx.answerOnCallback({ notification: msg });
        } else {
          await ctx.reply(msg);
        }
      }
      return;
    }

    const text = `⏱️ *Выбери длительность фокуса*\n\nСколько минут будешь работать без отвлечений?`;
    const keyboard = getFocusDurationKeyboard();

    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: { text, attachments: [keyboard], format: 'markdown' }
      });
    } else {
      await ctx.reply(text, { attachments: [keyboard], format: 'markdown' });
    }
  } catch (error: any) {
    const msg = error.message || messages.error;
    if (ctx.callback) {
      await ctx.answerOnCallback({ notification: msg });
    } else {
      await ctx.reply(msg);
    }
  }
}

export async function handleFocusStart(ctx: Context, duration: number): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      if (ctx.callback) {
        await ctx.answerOnCallback({
          notification: 'Не удалось определить пользователя'
        });
      } else {
        await ctx.reply('Не удалось определить пользователя');
      }
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      if (ctx.callback) {
        await ctx.answerOnCallback({
          notification: 'Пользователь не найден. Отправьте /start'
        });
      } else {
        await ctx.reply('Пользователь не найден. Отправьте /start');
      }
      return;
    }

    // Проверяем, нет ли активной сессии
    const activeSession = await pomodoroService.getActiveSession(user.id);
    if (activeSession) {
      const info = await pomodoroService.getSessionInfo(activeSession.id);
      if (info) {
        const timeLeft = pomodoroService.formatRemainingTime(
          info.remainingMinutes, 
          info.remainingSeconds
        );
        
        if (ctx.callback) {
          await ctx.answerOnCallback({
            notification: `У тебя уже есть активная сессия. Осталось: ${timeLeft}`
          });
        } else {
          await ctx.reply(`⚠️ У тебя уже есть активная фокус-сессия!\n\nОсталось: *${timeLeft}*`, {
            format: 'markdown'
          });
        }
        return;
      }
    }

    const activePod = await podService.getUserActivePod(user.id);
    if (activePod && activePod.status === PodStatus.ACTIVE) {
      const podTimeLeft = Math.max(0, activePod.duration -
        Math.floor((Date.now() - (activePod.startTime?.getTime() || Date.now())) / 60000));
      
      const podMessage = `⚠️ *Ты уже в Pod!*\n\n` +
        `*${activePod.title}*\n` +
        `👥 ${activePod.participants.length} участников\n` +
        `⏱️ Осталось: ~${podTimeLeft} мин\n\n` +
        `Сначала заверши Pod.`;
      
      if (ctx.callback) {
        await ctx.answerOnCallback({
          message: {
            text: podMessage,
            attachments: [getPodControlKeyboard(activePod.id, activePod.creatorId === user.id)],
            format: 'markdown'
          }
        });
      } else {
        await ctx.reply(podMessage, {
          attachments: [getPodControlKeyboard(activePod.id, activePod.creatorId === user.id)],
          format: 'markdown'
        });
      }
      return;
    }

    const session = await pomodoroService.startSession(user.id, duration);

    const endTime = new Date(Date.now() + duration * 60 * 1000);
    const startMessage = `⏱️ *Фокус-сессия запущена!*\n\n` +
      `Длительность: *${duration} минут*\n` +
      `Начало: ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}\n` +
      `Окончание: ${endTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}\n\n` +
      `Выключи отвлечения и сосредоточься! 💪\n\n` +
      `Напоминание придёт, когда время выйдет.`;

    const replyOptions = {
      attachments: [getPomodoroKeyboard(session.id)],
      format: 'markdown' as const
    };

    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: { text: startMessage, ...replyOptions }
      });
    } else {
      await ctx.reply(startMessage, replyOptions);
    }

    const timeoutId = setTimeout(async () => {
      await handlePomodoroTimeout(maxUserId, session.id);
    }, duration * 60 * 1000);

    // Сохраняем таймер для возможности отмены
    (global as any).pomodoroTimers = (global as any).pomodoroTimers || new Map();
    (global as any).pomodoroTimers.set(session.id, timeoutId);

  } catch (error: any) {
    console.error('Error in handleFocus25:', error);
    console.error('Error stack:', error.stack);
    
    if (ctx.callback) {
      await ctx.answerOnCallback({
        notification: `Ошибка: ${error.message || messages.error}`
      });
    } else {
      try {
        await ctx.reply(`Ошибка: ${error.message || messages.error}`);
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }
}

async function handlePomodoroTimeout(maxUserId: string, sessionId: string): Promise<void> {
  try {
    console.log('Pomodoro timeout triggered for session:', sessionId);
    
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      console.log('User not found for timeout:', maxUserId);
      return;
    }

    const session = await pomodoroService.getSessionInfo(sessionId);
    if (!session || session.session.completed) {
      console.log('Session not found or already completed:', sessionId);
      return;
    }

    // НЕ завершаем сессию автоматически, только отправляем сообщение
    // Пользователь сам выберет действие (Выполнил, Распилил и т.д.)
    const bot = (global as any).bot;
    if (!bot) {
      console.error('Bot not initialized in global scope!');
      return;
    }

    const duration = session.session.duration;
    const completeMessage = `🎉 *Фокус-сессия завершена!*\n\n` +
      `Поздравляем! Ты продержался все ${duration} минут! 💪\n\n` +
      `Что ты сделал за это время?`;

    console.log('Sending completion message to user:', maxUserId);
    
    await bot.api.sendMessageToUser(
      parseInt(maxUserId),
      completeMessage,
      {
        attachments: [getPomodoroCompleteKeyboard(sessionId)],
        format: 'markdown'
      }
    );
    
    console.log('Completion message sent successfully');
  } catch (error) {
    console.error('Error in handlePomodoroTimeout:', error);
  }
}

export async function handleSessionCancel(ctx: Context, sessionId: string): Promise<void> {
  try {
    // Очищаем таймеры
    const timers = (global as any).pomodoroTimers;
    if (timers && timers.has(sessionId)) {
      clearTimeout(timers.get(sessionId));
      timers.delete(sessionId);
    }

    await pomodoroService.cancelSession(sessionId);

    await ctx.answerOnCallback({
      message: {
        text: messages.sessionCancelled,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleSessionCancel:', error);
    await ctx.answerOnCallback({
      message: {
        text: messages.error,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  }
}

export async function handleSessionStatus(ctx: Context, sessionId: string): Promise<void> {
  try {
    const sessionInfo = await pomodoroService.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      await ctx.answerOnCallback({
        notification: 'Сессия не найдена или уже завершена'
      });
      return;
    }

    const { session, remainingMinutes, remainingSeconds } = sessionInfo;
    const totalSeconds = session.duration * 60;
    const remainingTotal = Math.max(0, remainingMinutes * 60 + remainingSeconds);
    const elapsedSeconds = Math.max(0, totalSeconds - remainingTotal);
    const progress = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));
    const barFilled = Math.round(progress / 10);
    const progressBar = `${'▓'.repeat(barFilled)}${'░'.repeat(10 - barFilled)} ${progress}%`;
    
    const timeLeft = pomodoroService.formatRemainingTime(remainingMinutes, remainingSeconds);
    const elapsedTime = pomodoroService.formatRemainingTime(
      Math.floor(elapsedSeconds / 60),
      elapsedSeconds % 60
    );
    
    const startTime = new Date(session.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const finishTime = new Date(new Date(session.startTime).getTime() + session.duration * 60 * 1000)
      .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const statusMessage = `⏱️ *Статус фокус-сессии*\n\n` +
      `${progressBar}\n` +
      `Прошло: *${elapsedTime}*\n` +
      `Осталось: *${timeLeft}*\n` +
      `Старт: ${startTime} • Финиш: ${finishTime}\n\n` +
      `Нажми "Статус" позже, чтобы обновить прогресс.`;

    await ctx.answerOnCallback({
      message: {
        text: statusMessage,
        attachments: [getPomodoroKeyboard(sessionId)],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleSessionStatus:', error);
    await ctx.answerOnCallback({
      notification: 'Ошибка при получении статуса'
    });
  }
}

export async function handleSessionComplete(
  ctx: Context, 
  sessionId: string, 
  action: string
): Promise<void> {
  try {
    console.log('handleSessionComplete called:', { sessionId, action });
    
    // Очищаем таймер
    const timers = (global as any).pomodoroTimers;
    if (timers && timers.has(sessionId)) {
      clearTimeout(timers.get(sessionId));
      timers.delete(sessionId);
    }

    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      console.log('No userId found');
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    console.log('maxUserId:', maxUserId);
    
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      console.log('User not found');
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден'
      });
      return;
    }

    console.log('User found:', user.id);

    // Преобразуем action в TaskAction
    let taskAction: TaskAction | undefined;
    switch (action) {
      case 'completed':
        taskAction = TaskAction.COMPLETED;
        break;
      case 'split':
        taskAction = TaskAction.SPLIT;
        break;
      case 'postponed':
        taskAction = TaskAction.POSTPONED;
        break;
      case 'skipped':
        taskAction = TaskAction.SKIPPED;
        break;
    }

    console.log('taskAction:', taskAction);

    const sessionInfo = await pomodoroService.getSessionInfo(sessionId);
    console.log('sessionInfo:', sessionInfo ? 'found' : 'not found');
    
    // Если сессия не найдена, значит она уже завершена ранее
    if (!sessionInfo) {
      await ctx.answerOnCallback({
        message: {
          text: '✅ *Эта сессия уже завершена!*\n\nНаграды уже были начислены.',
          attachments: [getBackToMenuKeyboard()],
          format: 'markdown'
        }
      });
      return;
    }
    
    // Проверяем, была ли уже завершена
    if (sessionInfo.session.completed) {
      await ctx.answerOnCallback({
        message: {
          text: '✅ *Эта сессия уже завершена!*\n\nНаграды уже были начислены.',
          attachments: [getBackToMenuKeyboard()],
          format: 'markdown'
        }
      });
      return;
    }
    
    // Считаем досрочным завершением, если осталось > 10% времени
    const totalSeconds = sessionInfo.session.duration * 60;
    const remainingTotal = sessionInfo.remainingMinutes * 60 + (sessionInfo.remainingSeconds || 0);
    const isEarly = (remainingTotal / totalSeconds) > 0.1;
    console.log('isEarly:', isEarly, 'remaining:', remainingTotal, 'total:', totalSeconds);
    
    const result = await pomodoroService.completeSession(sessionId, taskAction, isEarly);
    console.log('completeSession result:', result);

    const updatedUser = await db.getUser(user.id);
    if (!updatedUser) return;

    let responseText = '';
    
    // Разная логика для каждой кнопки
    switch (action) {
      case 'completed':
        if (result.reward > 0) {
          responseText = `🎉 *Отлично! Ты справился!*\n\n`;
          responseText += `+${result.reward} FocusCoins 🪙\n`;
          responseText += `Серия: ${updatedUser.currentStreak} дней 🔥\n`;
          responseText += `Всего Pomodoro: ${updatedUser.totalPomodoros}\n`;
          responseText += `Всего фокуса: ${Math.floor(updatedUser.totalFocusMinutes / 60)}ч ${updatedUser.totalFocusMinutes % 60}мин\n`;

          if (result.achievements.length > 0) {
            responseText += `\n🏆 *Новые достижения: ${result.achievements.length}!*`;
          }
        } else {
          responseText = `⏸️ *Сессия завершена досрочно*\n\n`;
          responseText += `Проработано: ${result.actualMinutes} мин из ${sessionInfo?.session.duration || 0}\n`;
          responseText += `Награды не начислены (нужно >= 90% времени)\n\n`;
          responseText += `Попробуй доработать до конца в следующий раз!`;
        }
        break;

      case 'split':
        responseText = `🍅 *Задача оказалась сложнее?*\n\n`;
        if (result.reward > 0) {
          responseText += `Сессия засчитана!\n`;
          responseText += `+${result.reward} FocusCoins 🪙\n\n`;
        }
        responseText += `Раздели задачу на подзадачи в разделе *Задачи*.\n`;
        responseText += `Меньшие задачи легче выполнять! 💪`;
        break;

      case 'postponed':
        responseText = `📅 *Задача отложена*\n\n`;
        if (result.reward > 0) {
          responseText += `Частичная награда: +${Math.floor(result.reward * 0.5)} FocusCoins 🪙\n\n`;
        }
        responseText += `Не забудь вернуться к задаче позже.\n`;
        responseText += `Постоянство важнее всего! ⏰`;
        break;

      case 'skipped':
        responseText = `⏭️ *Сессия пропущена*\n\n`;
        responseText += `Награды не начислены.\n\n`;
        responseText += `Ничего страшного! Бывает.\n`;
        responseText += `Главное - не останавливайся и попробуй снова! 💪`;
        break;

      default:
        responseText = `✅ *Сессия завершена*\n\n${messages.error}`;
    }

    await ctx.answerOnCallback({
      message: {
        text: responseText,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });

  } catch (error: any) {
    console.error('Error in handleSessionComplete:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    await ctx.answerOnCallback({
      message: {
        text: `❌ Ошибка: ${error.message || 'Неизвестная ошибка'}\n\n${messages.error}`,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  }
}

