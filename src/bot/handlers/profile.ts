/**
 * Обработчики для профиля и достижений
 */

import { Context } from '@maxhub/max-bot-api';
import { db } from '../../storage';
import { gamificationService } from '../../services/gamification';
import { messages } from '../messages';
import { 
  getProfileKeyboard, 
  getAchievementsKeyboard,
  getBackToMenuKeyboard 
} from '../keyboards';

export async function handleProfile(ctx: Context): Promise<void> {
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

    const stats = await gamificationService.getUserGameStats(user.id);

    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: {
          text: messages.profile(user, stats),
          attachments: [getProfileKeyboard()],
          format: 'markdown'
        }
      });
    } else {
      await ctx.reply(messages.profile(user, stats), {
        attachments: [getProfileKeyboard()],
        format: 'markdown'
      });
    }
  } catch (error) {
    console.error('Error in handleProfile:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleAchievements(ctx: Context): Promise<void> {
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

    const achievements = await gamificationService.getAchievementsWithProgress(user.id);

    await ctx.answerOnCallback({
      message: {
        text: messages.achievements(achievements),
        attachments: [getAchievementsKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleAchievements:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleStats(ctx: Context): Promise<void> {
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

    const stats = await db.getUserStats(user.id);
    
    if (!stats) {
      await ctx.answerOnCallback({
        message: {
          text: 'У тебя пока нет статистики. Начни свою первую фокус-сессию! 🚀',
          attachments: [getBackToMenuKeyboard()],
          format: 'markdown'
        }
      });
      return;
    }

    const weekStats = {
      pomodoros: stats.weekPomodoros,
      focusMinutes: stats.weekFocusMinutes,
      tasksCompleted: stats.weekTasksCompleted,
      focusCoins: stats.weekFocusCoins
    };

    await ctx.answerOnCallback({
      message: {
        text: messages.weeklyStats(weekStats),
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleStats:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleHelp(ctx: Context): Promise<void> {
  try {
    // Команды используют reply, callback actions используют answerOnCallback
    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: {
          text: messages.help,
          attachments: [getBackToMenuKeyboard()],
          format: 'markdown'
        }
      });
    } else {
      await ctx.reply(messages.help, {
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      });
    }
  } catch (error: any) {
    console.error('Error in handleHelp:', error);
    console.error('Error stack:', error.stack);
    
    try {
      await ctx.reply(`Ошибка: ${error.message || messages.error}`);
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
}

