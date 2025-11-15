/**
 * Сервис геймификации: FocusCoins, достижения, серии
 */

import * as crypto from 'crypto';
import { db } from '../storage';
import { User, Achievement, ACHIEVEMENTS, NotificationType } from '../types';

export class GamificationService {
  /**
   * Награждает пользователя FocusCoins
   */
  async awardFocusCoins(userId: string, amount: number, reason?: string): Promise<number> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    const newBalance = user.focusCoins + amount;
    await db.updateUser(userId, { focusCoins: newBalance });

    return newBalance;
  }

  /**
   * Обновляет серию дней пользователя
   */
  async updateStreak(userId: string): Promise<{ current: number; best: number }> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    const today = new Date().toDateString();
    const lastActive = new Date(user.lastActiveDate).toDateString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

    let currentStreak = user.currentStreak;
    let bestStreak = user.bestStreak;

    if (lastActive === today) {
      // Уже активен сегодня
      return { current: currentStreak, best: bestStreak };
    }

    if (lastActive === yesterday) {
      // Продолжение серии
      currentStreak += 1;
    } else {
      // Серия прервалась
      currentStreak = 1;
    }

    if (currentStreak > bestStreak) {
      bestStreak = currentStreak;
    }

    await db.updateUser(userId, {
      currentStreak,
      bestStreak,
      lastActiveDate: new Date().toISOString()
    });

    // Проверка достижений за серии
    await this.checkStreakAchievements(userId, currentStreak);

    return { current: currentStreak, best: bestStreak };
  }

  /**
   * Проверяет и выдает достижения за серии
   */
  private async checkStreakAchievements(userId: string, streak: number): Promise<void> {
    const streakAchievements = ACHIEVEMENTS.filter(
      a => a.requirement.type === 'streak' && a.requirement.count === streak
    );

    for (const achievement of streakAchievements) {
      await this.unlockAchievement(userId, achievement.id);
    }
  }

  /**
   * Разблокирует достижение для пользователя
   */
  async unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    // Проверяем, не разблокировано ли уже
    if (user.achievements.includes(achievementId)) {
      return false;
    }

    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return false;

    // Добавляем достижение
    user.achievements.push(achievementId);
    await db.updateUser(userId, { achievements: user.achievements });

    // Награждаем FocusCoins
    await this.awardFocusCoins(userId, achievement.reward, `Achievement: ${achievement.name}`);

    // Отправляем уведомление
    await db.createNotification({
      id: crypto.randomUUID(),
      userId,
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      message: `🏆 Разблокировано: ${achievement.icon} ${achievement.name}! +${achievement.reward} FocusCoins`,
      sentAt: new Date(),
      read: false
    });

    return true;
  }

  /**
   * Проверяет все возможные достижения пользователя
   */
  async checkAchievements(userId: string): Promise<string[]> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    const unlockedAchievements: string[] = [];

    for (const achievement of ACHIEVEMENTS) {
      // Пропускаем уже разблокированные
      if (user.achievements.includes(achievement.id)) continue;

      const meetsRequirement = await this.checkAchievementRequirement(user, achievement);
      if (meetsRequirement) {
        const unlocked = await this.unlockAchievement(userId, achievement.id);
        if (unlocked) {
          unlockedAchievements.push(achievement.id);
        }
      }
    }

    return unlockedAchievements;
  }

  /**
   * Проверяет, выполнено ли требование достижения
   */
  private async checkAchievementRequirement(user: User, achievement: Achievement): Promise<boolean> {
    const { type, count } = achievement.requirement;

    switch (type) {
      case 'pomodoros':
        return user.totalPomodoros >= count;
      
      case 'tasks':
        return user.completedTasks >= count;
      
      case 'streak':
        return user.currentStreak >= count;
      
      case 'focus_hours': {
        const hours = Math.floor(user.totalFocusMinutes / 60);
        return hours >= count;
      }
      
      case 'pods': {
        const userPods = await db.getUserPods(user.id);
        const createdPods = userPods.filter(p => p.creatorId === user.id);
        return createdPods.length >= count;
      }
      
      default:
        return false;
    }
  }

  /**
   * Вычисляет награду за Pomodoro с учетом множителей
   */
  calculatePomodoroReward(baseReward: number, streak: number, inPod: boolean): number {
    let reward = baseReward;

    // Бонус за серию (10% за каждые 3 дня, макс 50%)
    const streakBonus = Math.min(Math.floor(streak / 3) * 0.1, 0.5);
    reward += baseReward * streakBonus;

    // Бонус за Pod (+50%)
    if (inPod) {
      reward += baseReward * 0.5;
    }

    return Math.round(reward);
  }

  /**
   * Получает статистику пользователя
   */
  async getUserGameStats(userId: string): Promise<any> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    const stats = await db.getUserStats(userId);
    const sessions = await db.getUserSessions(userId);
    const pods = await db.getUserPods(userId);

    const unlockedAchievements = ACHIEVEMENTS.filter(a => 
      user.achievements.includes(a.id)
    );

    const totalAchievements = ACHIEVEMENTS.length;
    const achievementProgress = (unlockedAchievements.length / totalAchievements) * 100;

    return {
      focusCoins: user.focusCoins,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalPomodoros: user.totalPomodoros,
      totalFocusMinutes: user.totalFocusMinutes,
      totalFocusHours: Math.floor(user.totalFocusMinutes / 60),
      completedTasks: user.completedTasks,
      weekStats: stats ? {
        pomodoros: stats.weekPomodoros,
        focusMinutes: stats.weekFocusMinutes,
        tasksCompleted: stats.weekTasksCompleted,
        focusCoinsEarned: stats.weekFocusCoins
      } : null,
      todayStats: stats ? {
        pomodoros: stats.todayPomodoros,
        focusMinutes: stats.todayFocusMinutes
      } : null,
      achievements: {
        unlocked: unlockedAchievements.length,
        total: totalAchievements,
        progress: Math.round(achievementProgress),
        list: unlockedAchievements
      },
      pods: {
        total: pods.length,
        created: pods.filter(p => p.creatorId === userId).length
      }
    };
  }

  /**
   * Получает список всех достижений с прогрессом
   */
  async getAchievementsWithProgress(userId: string): Promise<any[]> {
    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    const result = [];

    for (const achievement of ACHIEVEMENTS) {
      const unlocked = user.achievements.includes(achievement.id);
      let progress = 0;

      if (!unlocked) {
        const { type, count } = achievement.requirement;
        
        switch (type) {
          case 'pomodoros':
            progress = Math.min((user.totalPomodoros / count) * 100, 100);
            break;
          case 'tasks':
            progress = Math.min((user.completedTasks / count) * 100, 100);
            break;
          case 'streak':
            progress = Math.min((user.currentStreak / count) * 100, 100);
            break;
          case 'focus_hours': {
            const hours = Math.floor(user.totalFocusMinutes / 60);
            progress = Math.min((hours / count) * 100, 100);
            break;
          }
          case 'pods': {
            const pods = await db.getUserPods(user.id);
            const created = pods.filter(p => p.creatorId === user.id).length;
            progress = Math.min((created / count) * 100, 100);
            break;
          }
        }
      } else {
        progress = 100;
      }

      result.push({
        ...achievement,
        unlocked,
        progress: Math.round(progress)
      });
    }

    return result;
  }
}

export const gamificationService = new GamificationService();

