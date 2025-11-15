/**
 * Сервис уведомлений и напоминаний
 */

import * as cron from 'node-cron';
import * as crypto from 'crypto';
import { db } from '../storage';
import { NotificationType } from '../types';
import { Bot } from '@maxhub/max-bot-api';

export class NotificationService {
  private bot: Bot | null = null;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Инициализация с ботом
   */
  initialize(bot: Bot): void {
    this.bot = bot;
    this.setupScheduledNotifications();
  }

  /**
   * Настройка запланированных уведомлений
   */
  private setupScheduledNotifications(): void {
    // Ежедневное напоминание в 9:00
    const dailyReminder = cron.schedule('0 9 * * *', async () => {
      await this.sendDailyReminders();
    });
    this.scheduledTasks.set('daily_reminder', dailyReminder);

    // Проверка серий в 20:00
    const streakWarning = cron.schedule('0 20 * * *', async () => {
      await this.sendStreakWarnings();
    });
    this.scheduledTasks.set('streak_warning', streakWarning);

    // Еженедельная статистика в понедельник в 9:00
    const weeklyStats = cron.schedule('0 9 * * 1', async () => {
      await this.sendWeeklyStats();
    });
    this.scheduledTasks.set('weekly_stats', weeklyStats);

    // Сброс дневной статистики в 00:00
    const resetDaily = cron.schedule('0 0 * * *', async () => {
      const { pomodoroService } = await import('./pomodoro');
      await pomodoroService.resetDailyStats();
    });
    this.scheduledTasks.set('reset_daily', resetDaily);

    // Сброс недельной статистики в понедельник в 00:00
    const resetWeekly = cron.schedule('0 0 * * 1', async () => {
      const { pomodoroService } = await import('./pomodoro');
      await pomodoroService.resetWeeklyStats();
    });
    this.scheduledTasks.set('reset_weekly', resetWeekly);

    console.log('✅ Scheduled notifications initialized');
  }

  /**
   * Отправляет ежедневные напоминания
   */
  private async sendDailyReminders(): Promise<void> {
    const users = await db.getAllUsers();
    
    for (const user of users) {
      const stats = await db.getUserStats(user.id);
      
      if (!stats || stats.todayPomodoros === 0) {
        const message = `Привет! У тебя ${stats?.todayPomodoros || 0} Pomodoro сегодня. Может, начнёшь? 🚀`;
        
        await this.sendNotification(user.id, NotificationType.DAILY_REMINDER, message);
      }
    }
  }

  /**
   * Отправляет предупреждения о серии
   */
  private async sendStreakWarnings(): Promise<void> {
    const users = await db.getAllUsers();
    const now = new Date();
    
    for (const user of users) {
      if (user.currentStreak > 0) {
        const lastActive = new Date(user.lastActiveDate);
        const today = new Date().toDateString();
        
        // Если сегодня еще не было активности
        if (lastActive.toDateString() !== today) {
          const stats = await db.getUserStats(user.id);
          
          if (!stats || stats.todayPomodoros === 0) {
            const message = `⚠️ Твоя серия в опасности! ${user.currentStreak} дней 🔥 Осталось ${24 - now.getHours()} часов до конца дня.`;
            
            await this.sendNotification(user.id, NotificationType.STREAK_WARNING, message);
          }
        }
      }
    }
  }

  /**
   * Отправляет еженедельную статистику
   */
  private async sendWeeklyStats(): Promise<void> {
    const users = await db.getAllUsers();
    
    for (const user of users) {
      const stats = await db.getUserStats(user.id);
      
      if (stats && stats.weekPomodoros > 0) {
        const hours = Math.floor(stats.weekFocusMinutes / 60);
        const minutes = stats.weekFocusMinutes % 60;
        
        const message = `📊 Статистика за неделю:\n` +
          `🎯 Pomodoro: ${stats.weekPomodoros}\n` +
          `⏱️ Фокуса: ${hours}ч ${minutes}мин\n` +
          `✅ Задач: ${stats.weekTasksCompleted}\n` +
          `🪙 FocusCoins: +${stats.weekFocusCoins}\n\n` +
          `Отличная работа! Так держать! 💪`;
        
        await this.sendNotification(user.id, NotificationType.WEEKLY_STATS, message);
      }
    }
  }

  /**
   * Отправляет уведомление пользователю
   */
  async sendNotification(userId: string, type: NotificationType, message: string): Promise<void> {
    // Сохраняем в базу
    await db.createNotification({
      id: crypto.randomUUID(),
      userId,
      type,
      message,
      sentAt: new Date(),
      read: false
    });

    // Отправляем через бота, если доступен
    if (this.bot) {
      const user = await db.getUser(userId);
      if (user?.maxUserId) {
        try {
          await this.bot.api.sendMessageToUser(
            parseInt(user.maxUserId),
            message
          );
        } catch (error) {
          console.error(`Failed to send notification to user ${userId}:`, error);
        }
      }
    }
  }

  /**
   * Получает непрочитанные уведомления пользователя
   */
  async getUnreadNotifications(userId: string): Promise<any[]> {
    const notifications = await db.getUserNotifications(userId);
    return notifications.filter(n => !n.read);
  }

  /**
   * Отмечает уведомление как прочитанное
   */
  async markAsRead(notificationId: string): Promise<void> {
    await db.markNotificationRead(notificationId);
  }

  /**
   * Отмечает все уведомления как прочитанные
   */
  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await db.getUserNotifications(userId);
    for (const notification of notifications) {
      if (!notification.read) {
        await db.markNotificationRead(notification.id);
      }
    }
  }

  /**
   * Напоминание о задаче
   */
  async scheduleTaskReminder(
    userId: string, 
    taskTitle: string, 
    reminderTime: Date
  ): Promise<void> {
    const now = new Date();
    const delay = reminderTime.getTime() - now.getTime();
    
    if (delay > 0) {
      setTimeout(async () => {
        const message = `⏰ Напоминание: ${taskTitle}`;
        await this.sendNotification(userId, NotificationType.DAILY_REMINDER, message);
      }, delay);
    }
  }

  /**
   * Уведомление о завершении Pod
   */
  async notifyPodCompletion(podId: string): Promise<void> {
    const { podService } = await import('./pods');
    const pod = await podService.getPod(podId);
    
    if (!pod) return;

    for (const participant of pod.participants) {
      const message = `🎉 Pod "${pod.title}" завершён!\n\nЧто ты сделал за ${pod.duration} минут?`;
      await this.sendNotification(participant.userId, NotificationType.POD_COMPLETED, message);
    }
  }

  /**
   * Уведомление о достижении
   */
  async notifyAchievement(userId: string, achievementName: string, reward: number): Promise<void> {
    const message = `🏆 Разблокировано: ${achievementName}!\n+${reward} FocusCoins`;
    await this.sendNotification(userId, NotificationType.ACHIEVEMENT_UNLOCKED, message);
  }

  /**
   * Останавливает все запланированные задачи
   */
  stopAll(): void {
    for (const [name, task] of this.scheduledTasks) {
      task.stop();
      console.log(`Stopped scheduled task: ${name}`);
    }
    this.scheduledTasks.clear();
  }

  /**
   * Запускает все запланированные задачи
   */
  startAll(): void {
    for (const [name, task] of this.scheduledTasks) {
      task.start();
      console.log(`Started scheduled task: ${name}`);
    }
  }
}

export const notificationService = new NotificationService();

