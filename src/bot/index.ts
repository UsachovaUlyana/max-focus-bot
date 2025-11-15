/**
 * Главный файл бота MAX Focus Pods
 */

import { Bot } from '@maxhub/max-bot-api';
import { db } from '../storage';
import { notificationService } from '../services/notifications';
import {
  handleStart,
  handleBackToMenu,
  handleAddTask,
  handleTaskInput,
  handleMyTasks,
  handleTaskPage,
  handleTaskView,
  handleTaskAction,
  handleTaskSplitCount,
  handleSubtaskNameInput,
  handleFocusDurationSelect,
  handleFocusStart,
  handleSessionCancel,
  handleSessionStatus,
  handleSessionComplete,
  handleCreatePod,
  handlePodDuration,
  handlePodStart,
  handlePodCancel,
  handlePodInfo,
  handleShowPodCode,
  handleJoinByCode,
  handleJoinCommand,
  handlePodCodeInput,
  handleProfile,
  handleAchievements,
  handleStats,
  handleHelp
} from './handlers';
import { messages } from './messages';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Сохраняем бота глобально для доступа из других модулей
  (global as any).bot = bot;

  // Инициализируем сервис уведомлений
  notificationService.initialize(bot);

  // Устанавливаем команды
  bot.api.setMyCommands([
    { name: 'start', description: 'Главное меню' },
    { name: 'tasks', description: 'Мои задачи' },
    { name: 'focus', description: 'Запустить Pomodoro 25 минут' },
    { name: 'pod', description: 'Создать фокус-Pod' },
    { name: 'join', description: 'Присоединиться к Pod по коду' },
    { name: 'profile', description: 'Мой профиль' },
    { name: 'help', description: 'Помощь' }
  ]).catch(err => console.error('Failed to set commands:', err));

  // === КОМАНДЫ ===
  
  bot.command('start', async (ctx) => {
    console.log('Command /start received');
    try {
      await handleStart(ctx);
    } catch (error) {
      console.error('Error in /start command:', error);
      await ctx.reply(messages.error);
    }
  });
  
  bot.command('tasks', async (ctx) => {
    console.log('Command /tasks received');
    try {
      await handleMyTasks(ctx);
    } catch (error) {
      console.error('Error in /tasks command:', error);
      await ctx.reply(messages.error);
    }
  });
  
  bot.command('focus', async (ctx) => {
    try {
      await handleFocusDurationSelect(ctx);
    } catch (error) {
      await ctx.reply(messages.error);
    }
  });
  
  bot.command('pod', async (ctx) => {
    try {
      await handleCreatePod(ctx);
    } catch (error) {
      await ctx.reply(messages.error);
    }
  });
  
  bot.command('join', async (ctx) => {
    try {
      await handleJoinCommand(ctx);
    } catch (error) {
      await ctx.reply(messages.error);
    }
  });

  bot.command('profile', async (ctx) => {
    try {
      await handleProfile(ctx);
    } catch (error) {
      await ctx.reply(messages.error);
    }
  });
  
  bot.command('help', async (ctx) => {
    try {
      await handleHelp(ctx);
    } catch (error) {
      await ctx.reply(messages.error);
    }
  });

  // Событие запуска бота (первое открытие)
  bot.on('bot_started', handleStart);

  // === CALLBACK ACTIONS ===

  // Главное меню
  bot.action('action:back_to_menu', handleBackToMenu);
  bot.action('action:help', handleHelp);

  // Задачи
  bot.action('action:add_task', handleAddTask);
  bot.action('action:my_tasks', handleMyTasks);
  bot.action(/^task_page:(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match?.[1] || '0');
    await handleTaskPage(ctx, page);
  });
  bot.action(/^task_view:(.+)$/, async (ctx) => {
    const taskId = ctx.match?.[1];
    if (taskId) await handleTaskView(ctx, taskId);
  });
  bot.action(/^task_action:(.+):(.+)$/, async (ctx) => {
    const taskId = ctx.match?.[1];
    const action = ctx.match?.[2];
    if (taskId && action) await handleTaskAction(ctx, taskId, action);
  });
  bot.action(/^task_split_count:(.+):(\d+)$/, async (ctx) => {
    const taskId = ctx.match?.[1];
    const count = parseInt(ctx.match?.[2] || '2');
    if (taskId) await handleTaskSplitCount(ctx, taskId, count);
  });

  // Pomodoro
  bot.action('action:focus_duration', handleFocusDurationSelect);
  bot.action(/^focus_duration:(\d+)$/, async (ctx) => {
    const duration = parseInt(ctx.match?.[1] || '25');
    await handleFocusStart(ctx, duration);
  });
  bot.action(/^session_cancel:(.+)$/, async (ctx) => {
    const sessionId = ctx.match?.[1];
    if (sessionId) await handleSessionCancel(ctx, sessionId);
  });
  bot.action(/^session_status:(.+)$/, async (ctx) => {
    const sessionId = ctx.match?.[1];
    if (sessionId) await handleSessionStatus(ctx, sessionId);
  });
  bot.action(/^session_complete:(.+):(.+)$/, async (ctx) => {
    const sessionId = ctx.match?.[1];
    const action = ctx.match?.[2];
    if (sessionId && action) await handleSessionComplete(ctx, sessionId, action);
  });

  // Pods
  bot.action('action:create_pod', handleCreatePod);
  bot.action('action:join_by_code', handleJoinByCode);
  bot.action(/^pod_duration:(.+)$/, async (ctx) => {
    const duration = ctx.match?.[1];
    if (duration) await handlePodDuration(ctx, duration);
  });
  bot.action(/^pod_start:(.+)$/, async (ctx) => {
    const podId = ctx.match?.[1];
    if (podId) await handlePodStart(ctx, podId);
  });
  bot.action(/^pod_cancel:(.+)$/, async (ctx) => {
    const podId = ctx.match?.[1];
    if (podId) await handlePodCancel(ctx, podId);
  });
  bot.action(/^pod_info:(.+)$/, async (ctx) => {
    const podId = ctx.match?.[1];
    if (podId) await handlePodInfo(ctx, podId);
  });
  bot.action(/^pod_show_code:(.+)$/, async (ctx) => {
    const podId = ctx.match?.[1];
    if (podId) await handleShowPodCode(ctx, podId);
  });
  bot.action(/^pod_share:(.+)$/, async (ctx) => {
    const podId = ctx.match?.[1];
    if (podId) await handleShowPodCode(ctx, podId);
  });

  // Профиль
  bot.action('action:profile', handleProfile);
  bot.action('action:achievements', handleAchievements);
  bot.action('action:stats', handleStats);

  // === ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ===

  bot.on('message_created', async (ctx) => {
    try {
      const userId = ctx.message?.sender?.user_id;
      if (!userId) return;

      const maxUserId = String(userId);
      const user = await db.getUserByMaxId(maxUserId);
      if (!user) {
        await ctx.reply('Отправь /start для начала работы');
        return;
      }

      const botState = await db.getBotState(user.id);
      const text = ctx.message?.body?.text;

      if (!text) return;

      if (botState && botState.state) {
        switch (botState.state) {
          case 'awaiting_task':
            await handleTaskInput(ctx, text);
            return;
          
          case 'awaiting_pod_code':
            await handlePodCodeInput(ctx, text);
            return;
          
          case 'naming_subtasks':
            await handleSubtaskNameInput(ctx, text);
            return;
        }
      }
    } catch (error) {
      console.error('Error in message_created:', error);
    }
  });

  bot.catch((error) => {
    console.error('Bot error:', error);
  });

  return bot;
}

export function startBot(bot: Bot): void {
  bot.start();
  console.log('🚀 Bot started');
}

