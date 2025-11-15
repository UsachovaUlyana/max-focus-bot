/**
 * Обработчики для Focus Pods
 */

import { Context } from '@maxhub/max-bot-api';
import { db } from '../../storage';
import { podService } from '../../services/pods';
import { pomodoroService } from '../../services/pomodoro';
import { PodStatus, User } from '../../types';
import { messages } from '../messages';
import { 
  getPodDurationKeyboard, 
  getPodControlKeyboard,
  getPodQRKeyboard,
  getBackToMenuKeyboard,
  getPomodoroKeyboard
} from '../keyboards';

export async function handleCreatePod(ctx: Context): Promise<void> {
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

    const preferCallback = Boolean(ctx.callback);
    if (await ensureNoActivePomodoroSession(ctx, user, preferCallback)) {
      return;
    }

    if (await ensureNoActivePod(ctx, user, preferCallback)) {
      return;
    }

    // Устанавливаем состояние выбора длительности
    await db.setBotState({
      userId: user.id,
      chatId: String(ctx.chatId || userId),
      state: 'creating_pod',
      updatedAt: new Date()
    });

    const replyOptions = {
      attachments: [getPodDurationKeyboard()],
      format: 'markdown' as const
    };

    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: {
          text: '🎯 Создаём фокус-Pod!\n\nВыбери длительность:',
          ...replyOptions
        }
      });
    } else {
      await ctx.reply('🎯 Создаём фокус-Pod!\n\nВыбери длительность:', replyOptions);
    }
  } catch (error: any) {
    console.error('Error in handleCreatePod:', error);
    console.error('Error stack:', error.stack);
    
    if (ctx.callback) {
      await ctx.answerOnCallback({
        notification: `Ошибка: ${error.message || messages.error}`
      });
    } else {
      await ctx.reply(`Ошибка: ${error.message || messages.error}`);
    }
  }
}

export async function handlePodDuration(ctx: Context, duration: string): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден. Отправьте /start'
      });
      return;
    }

    const durationMinutes = parseInt(duration);
    const userName = user.name;

    const preferCallback = Boolean(ctx.callback);

    if (await ensureNoActivePomodoroSession(ctx, user, preferCallback)) {
      await db.clearBotState(user.id);
      return;
    }

    if (await ensureNoActivePod(ctx, user, preferCallback)) {
      await db.clearBotState(user.id);
      return;
    }

    try {
      // Создаем Pod
      const { pod, inviteCode } = await podService.createPod(
        user.id,
        userName,
        durationMinutes,
        `Фокус-Pod от ${userName}`
      );

      // Формируем сообщение с invite code и ссылкой
      let podMessage = `🎯 *Pod создан!*\n\n`;
      podMessage += `*${pod.title}*\n`;
      podMessage += `⏱️ ${pod.duration} минут\n`;
      podMessage += `👥 ${pod.participants.length} участников\n\n`;
      podMessage += `🔑 *Код:* \`${inviteCode}\`\n`;
      podMessage += `📤 *Ссылка:*\n${pod.shareLink}\n\n`;
      podMessage += `Когда все готовы, нажми Начать`;

      // MAX deep link всегда валиден, убираем проверку localhost
      const attachments: any[] = [getPodQRKeyboard(pod.id, pod.shareLink)];

      await ctx.answerOnCallback({
        message: {
          text: podMessage,
          attachments,
          format: 'markdown'
        }
      });
    } catch (podError: any) {
      console.error('Error creating pod:', podError);
      await ctx.answerOnCallback({
        notification: `Ошибка при создании Pod: ${podError.message || 'Неизвестная ошибка'}`
      });
      throw podError;
    }

    // Очищаем состояние
    await db.clearBotState(user.id);

  } catch (error: any) {
    console.error('Error in handlePodDuration:', error);
    console.error('Error stack:', error.stack);
    
    if (ctx.callback) {
      await ctx.answerOnCallback({
        notification: `Ошибка: ${error.message || messages.error}`
      });
    } else {
      await ctx.reply(`Ошибка: ${error.message || messages.error}`);
    }
  }
}

export async function handlePodStart(ctx: Context, podId: string): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден. Отправьте /start'
      });
      return;
    }

    const pod = await podService.getPod(podId);
    if (!pod) {
      await ctx.answerOnCallback({ notification: messages.podNotFound });
      return;
    }

    // Проверяем, является ли пользователь создателем
    if (pod.creatorId !== user.id) {
      await ctx.answerOnCallback({ 
        notification: 'Только создатель может запустить Pod' 
      });
      return;
    }

    if (await ensureNoActivePomodoroSession(ctx, user, true)) {
      return;
    }

    if (await ensureNoActivePod(ctx, user, true, podId)) {
      return;
    }

    // Запускаем Pod
    await podService.startPod(podId);

    await ctx.answerOnCallback({
      message: {
        text: messages.podStarted(pod.title, pod.duration),
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });

    // Устанавливаем таймер на завершение
    setTimeout(async () => {
      await handlePodTimeout(podId);
    }, pod.duration * 60 * 1000);

  } catch (error: any) {
    console.error('Error in handlePodStart:', error);
    await ctx.answerOnCallback({
      notification: error.message || messages.error
    });
  }
}

async function handlePodTimeout(podId: string): Promise<void> {
  try {
    const pod = await podService.completePod(podId);
    
    // Уведомления отправляются через notificationService
    console.log(`Pod ${podId} completed`);
  } catch (error) {
    console.error('Error in handlePodTimeout:', error);
  }
}

export async function handlePodCancel(ctx: Context, podId: string): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден. Отправьте /start'
      });
      return;
    }

    const pod = await podService.getPod(podId);
    if (!pod) {
      await ctx.answerOnCallback({ notification: messages.podNotFound });
      return;
    }

    if (pod.creatorId !== user.id) {
      await ctx.answerOnCallback({ 
        notification: 'Только создатель может отменить Pod' 
      });
      return;
    }

    await podService.cancelPod(podId);
    await db.clearBotState(user.id);

    await ctx.answerOnCallback({
      message: {
        text: '❌ *Pod отменён*\n\nСессия отменена создателем.',
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    await ctx.reply(messages.error);
  }
}

export async function handlePodInfo(ctx: Context, podId: string): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден. Отправьте /start'
      });
      return;
    }

    const podInfo = await podService.getPodInfo(podId);
    if (!podInfo) {
      await ctx.answerOnCallback({ notification: messages.podNotFound });
      return;
    }

    const { pod } = podInfo;
    const isCreator = pod.creatorId === user.id;

    const podText = podService.formatPodInfo(pod);

    await ctx.answerOnCallback({
      message: {
        text: podText,
        attachments: [getPodControlKeyboard(podId, isCreator)],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handlePodInfo:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleShowPodCode(ctx: Context, podId: string): Promise<void> {
  try {
    const pod = await podService.getPod(podId);
    if (!pod) {
      await ctx.answerOnCallback({ notification: messages.podNotFound });
      return;
    }

    const botUsername = process.env.BOT_USERNAME || 'focus_pods_bot';
    
    await ctx.answerOnCallback({
      message: {
        text: `🔑 *Код приглашения в Pod*\n\n` +
              `\`${pod.inviteCode}\`\n\n` +
              `📤 *Как пригласить друзей:*\n` +
              `1️⃣ Отправь им код: \`${pod.inviteCode}\`\n` +
              `2️⃣ Или отправь ссылку:\n${pod.shareLink}\n\n` +
              `Друзья смогут присоединиться по кнопке внизу или отправив тебе /join ${pod.inviteCode}`,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleShowPodCode:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleJoinByCode(ctx: Context): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({
        notification: 'Не удалось определить пользователя'
      });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({
        notification: 'Пользователь не найден. Отправьте /start'
      });
      return;
    }

    await db.setBotState({
      userId: user.id,
      chatId: String(ctx.chatId || userId),
      state: 'awaiting_pod_code',
      updatedAt: new Date()
    });

    await replyWithMarkdown(
      ctx,
      `🔑 *Присоединиться к Pod'у*\n\n` +
        `Отправь код (например: \`A4F2B9E1\`) или набери \`/join A4F2B9E1\`.\n` +
        `Ссылки MAX иногда не открываются, поэтому используем текстовые коды.`,
      [getBackToMenuKeyboard()],
      Boolean(ctx.callback)
    );
  } catch (error) {
    console.error('Error in handleJoinByCode:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleJoinCommand(ctx: Context): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.message?.sender?.user_id;
    if (!userId) {
      await ctx.reply('Не удалось определить пользователя');
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.reply('Пользователь не найден. Отправь /start');
      return;
    }

    const text = ctx.message?.body?.text || '';
    const parts = text.trim().split(/\s+/);
    const codeArg = parts.length > 1 ? parts[1] : undefined;

    if (codeArg) {
      await processPodJoinByCode(ctx, user, codeArg, { preferCallback: false, clearStateOnSuccess: false });
    } else {
      await handleJoinByCode(ctx);
    }
  } catch (error) {
    console.error('Error in handleJoinCommand:', error);
    await ctx.reply(messages.error);
  }
}

export async function handlePodCodeInput(ctx: Context, text: string): Promise<void> {
  try {
    const userId = ctx.message?.sender?.user_id;
    if (!userId) return;

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) return;

    // Извлекаем код - либо из ссылки, либо просто код
    let inviteCode = text.trim().toUpperCase();
    
    // Если это ссылка, извлекаем код
    const linkMatch = text.match(/start=pod_([A-F0-9]+)/i);
    if (linkMatch) {
      inviteCode = linkMatch[1].toUpperCase();
    }

    // Ищем Pod по коду
    const pod = await podService.findPodByInviteCode(inviteCode);
    
    if (!pod) {
      await ctx.reply(
        `❌ Pod с кодом \`${inviteCode}\` не найден.\n\n` +
        `Проверь код и попробуй ещё раз.`,
        { format: 'markdown' }
      );
      return;
    }

    // Проверяем что пользователь ещё не в Pod'е
    const alreadyJoined = pod.participants.some(p => p.userId === user.id);
    if (alreadyJoined) {
      await ctx.reply(
        `⚠️ Ты уже в этом Pod'е!\n\n` +
        `*${pod.title}*\n` +
        `👥 Участников: ${pod.participants.length}`,
        {
          attachments: [getPodControlKeyboard(pod.id, user.id === pod.creatorId)],
          format: 'markdown'
        }
      );
      await db.clearBotState(user.id);
      return;
    }

    await processPodJoinByCode(ctx, user, text, { clearStateOnSuccess: true });
  } catch (error) {
    console.error('Error in handlePodCodeInput:', error);
    await ctx.reply(messages.error);
  }
}

/**
 * Универсальный ответ с markdown
 */
async function replyWithMarkdown(
  ctx: Context,
  text: string,
  attachments: any[] = [],
  preferCallback: boolean = Boolean(ctx.callback)
): Promise<void> {
  const messagePayload = {
    text,
    format: 'markdown' as const
  } as any;

  if (attachments.length > 0) {
    messagePayload.attachments = attachments;
  }

  if (preferCallback && ctx.callback) {
    await ctx.answerOnCallback({ message: messagePayload });
  } else {
    const replyOptions = attachments.length > 0
      ? { attachments, format: 'markdown' as const }
      : { format: 'markdown' as const };
    await ctx.reply(text, replyOptions);
  }
}

async function ensureNoActivePomodoroSession(
  ctx: Context,
  user: User,
  preferCallback = Boolean(ctx.callback)
): Promise<boolean> {
  const session = await pomodoroService.getActiveSession(user.id);
  if (!session) return false;

  const info = await pomodoroService.getSessionInfo(session.id);
  const timeLeft = info
    ? pomodoroService.formatRemainingTime(info.remainingMinutes, info.remainingSeconds)
    : 'несколько минут';

  const message = `⏱️ *Фокус-сессия уже идёт*\n\n` +
    `Осталось: *${timeLeft}*\n\n` +
    `Сначала заверши или отменяй Pomodoro, чтобы не смешивать режимы.`;

  await replyWithMarkdown(ctx, message, [getPomodoroKeyboard(session.id)], preferCallback);
  return true;
}

async function ensureNoActivePod(
  ctx: Context,
  user: User,
  preferCallback = Boolean(ctx.callback),
  excludePodId?: string
): Promise<boolean> {
  const currentPod = await podService.getUserActivePod(user.id);
  if (!currentPod || currentPod.id === excludePodId) return false;

  const statusLabel = currentPod.status === PodStatus.WAITING ? '🕓 Ожидание' : '🟢 Идёт';
  const minutesLeft = currentPod.status === PodStatus.ACTIVE
    ? Math.max(
        0,
        currentPod.duration -
          Math.floor((Date.now() - (currentPod.startTime?.getTime() || Date.now())) / 60000)
      )
    : currentPod.duration;
  const timingText = currentPod.status === PodStatus.ACTIVE
    ? `⏱️ Осталось: ~${minutesLeft} мин`
    : `⏱️ Длительность: ${currentPod.duration} мин`;

  const message = `⚠️ *У тебя уже есть активный Pod*\n\n` +
    `*${currentPod.title}*\n` +
    `Статус: ${statusLabel}\n` +
    `${timingText}\n\n` +
    `Сначала заверши или отмени текущий Pod.`;

  await replyWithMarkdown(
    ctx,
    message,
    [getPodControlKeyboard(currentPod.id, currentPod.creatorId === user.id)],
    preferCallback
  );
  return true;
}

function extractInviteCode(rawInput: string): string | null {
  if (!rawInput) return null;
  const linkMatch = rawInput.match(/start=pod_([A-Za-z0-9]+)/i);
  if (linkMatch) return linkMatch[1].toUpperCase();

  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts[0].toLowerCase() === '/join' && parts[1]) {
    return parts[1].toUpperCase();
  }

  const codeMatch = trimmed.match(/([A-Za-z0-9]{6,})/);
  return codeMatch ? codeMatch[1].toUpperCase() : null;
}

async function processPodJoinByCode(
  ctx: Context,
  user: User,
  rawInput: string,
  options: { preferCallback?: boolean; clearStateOnSuccess?: boolean } = {}
): Promise<void> {
  const { preferCallback = Boolean(ctx.callback), clearStateOnSuccess = true } = options;
  const inviteCode = extractInviteCode(rawInput);

  if (!inviteCode) {
    await replyWithMarkdown(
      ctx,
      '❌ Не нашёл код приглашения. Попробуй формат `A4F2B9E1` или `/join A4F2B9E1`.',
      [],
      preferCallback
    );
    return;
  }

  if (await ensureNoActivePomodoroSession(ctx, user, preferCallback)) {
    if (clearStateOnSuccess) await db.clearBotState(user.id);
    return;
  }

  if (await ensureNoActivePod(ctx, user, preferCallback)) {
    if (clearStateOnSuccess) await db.clearBotState(user.id);
    return;
  }

  const pod = await podService.findPodByInviteCode(inviteCode);
  if (!pod) {
    await replyWithMarkdown(
      ctx,
      `❌ Pod с кодом \`${inviteCode}\` не найден.\n\nПроверь код и попробуй ещё раз.`,
      [],
      preferCallback
    );
    return;
  }

  const alreadyJoined = pod.participants.some(p => p.userId === user.id);
  if (alreadyJoined) {
    await replyWithMarkdown(
      ctx,
      `⚠️ Ты уже в этом Pod'е!\n\n*${pod.title}*\n👥 Участников: ${pod.participants.length}`,
      [getPodControlKeyboard(pod.id, user.id === pod.creatorId)],
      preferCallback
    );
    if (clearStateOnSuccess) await db.clearBotState(user.id);
    return;
  }

  const updatedPod = await podService.joinPod(pod.id, user.id, user.name);

  if (clearStateOnSuccess) {
    await db.clearBotState(user.id);
  }

  await replyWithMarkdown(
    ctx,
    `✅ *Присоединился к Pod'у!*\n\n` +
      `*${updatedPod.title}*\n` +
      `👥 Участников: ${updatedPod.participants.length}\n` +
      `⏱️ Длительность: ${updatedPod.duration} минут\n` +
      `🎯 Создатель: ${updatedPod.participants.find(p => p.isCreator)?.userName}\n\n` +
      `Когда все будут готовы, нажмите «Начать».`,
    [getPodControlKeyboard(updatedPod.id, false)],
    preferCallback
  );
}

