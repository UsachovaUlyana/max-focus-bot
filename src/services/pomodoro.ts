/**
 * Сервис Pomodoro таймера
 */

import * as crypto from 'crypto';
import { db } from '../storage';
import { PomodoroSession, TaskAction } from '../types';
import { gamificationService } from './gamification';

export class PomodoroService {
  private activeSessions: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Запускает Pomodoro сессию
   */
  async startSession(userId: string, duration: number = 25, podId?: string): Promise<PomodoroSession> {
    // Проверяем, нет ли уже активной сессии
    const existingSessions = await db.getUserSessions(userId);
    const activeSession = existingSessions.find(s => !s.completed && !s.endTime);
    
    if (activeSession) {
      throw new Error('У вас уже есть активная сессия');
    }

    const user = await db.getUser(userId);
    if (!user) throw new Error('User not found');

    // Создаем сессию
    const session: PomodoroSession = {
      id: crypto.randomUUID(),
      userId,
      duration,
      startTime: new Date(),
      completed: false,
      podId,
      reward: 0
    };

    await db.createSession(session);

    // Обновляем серию пользователя
    await gamificationService.updateStreak(userId);

    return session;
  }

  /**
   * Завершает Pomodoro сессию
   */
  async completeSession(
    sessionId: string, 
    taskAction?: TaskAction,
    isEarlyCompletion = false
  ): Promise<{ session: PomodoroSession; reward: number; achievements: string[]; actualMinutes: number }> {
    const session = await db.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    if (session.completed) {
      throw new Error('Session already completed');
    }

    const user = await db.getUser(session.userId);
    if (!user) throw new Error('User not found');

    const actualMinutes = Math.floor((Date.now() - session.startTime.getTime()) / 60000);
    const completionRate = actualMinutes / session.duration;
    
    let reward = 0;
    let achievements: string[] = [];

    if (completionRate >= 0.9 || !isEarlyCompletion) {
      const baseReward = 1;
      const inPod = !!session.podId;
      reward = gamificationService.calculatePomodoroReward(baseReward, user.currentStreak, inPod);

      await db.updateUser(session.userId, {
        totalPomodoros: user.totalPomodoros + 1,
        totalFocusMinutes: user.totalFocusMinutes + actualMinutes,
        focusCoins: user.focusCoins + reward
      });

      await this.updateUserStats(session.userId, actualMinutes, reward);
      achievements = await gamificationService.checkAchievements(session.userId);
    } else {
      await db.updateUser(session.userId, {
        totalFocusMinutes: user.totalFocusMinutes + actualMinutes
      });
    }

    const updated = await db.updateSession(sessionId, {
      completed: true,
      endTime: new Date(),
      taskAction,
      reward
    });

    if (!updated) throw new Error('Failed to update session');

    const timer = this.activeSessions.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.activeSessions.delete(sessionId);
    }

    return { session: updated, reward, achievements, actualMinutes };
  }

  /**
   * Отменяет Pomodoro сессию
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const session = await db.getSession(sessionId);
    if (!session) return false;

    await db.updateSession(sessionId, {
      completed: false,
      endTime: new Date()
    });

    // Удаляем таймер
    const timer = this.activeSessions.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.activeSessions.delete(sessionId);
    }

    return true;
  }

  /**
   * Получает активную сессию пользователя
   */
  async getActiveSession(userId: string): Promise<PomodoroSession | undefined> {
    const sessions = await db.getUserSessions(userId);
    return sessions.find(s => !s.completed && !s.endTime);
  }

  /**
   * Получает информацию о сессии с оставшимся временем
   */
  async getSessionInfo(sessionId: string): Promise<{
    session: PomodoroSession;
    remainingMinutes: number;
    remainingSeconds: number;
  } | undefined> {
    const session = await db.getSession(sessionId);
    if (!session || session.completed) return undefined;

    const elapsed = Date.now() - session.startTime.getTime();
    const totalMs = session.duration * 60 * 1000;
    const remaining = Math.max(0, totalMs - elapsed);
    
    const remainingMinutes = Math.floor(remaining / (60 * 1000));
    const remainingSeconds = Math.floor((remaining % (60 * 1000)) / 1000);

    return {
      session,
      remainingMinutes,
      remainingSeconds
    };
  }

  /**
   * Форматирует оставшееся время
   */
  formatRemainingTime(minutes: number, seconds: number): string {
    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * Обновляет статистику пользователя
   */
  private async updateUserStats(userId: string, minutes: number, coins: number): Promise<void> {
    let stats = await db.getUserStats(userId);
    
    const today = new Date().toDateString();
    const monday = this.getMonday(new Date());

    if (!stats) {
      stats = {
        userId,
        weekPomodoros: 0,
        weekFocusMinutes: 0,
        weekTasksCompleted: 0,
        weekFocusCoins: 0,
        todayPomodoros: 0,
        todayFocusMinutes: 0
      };
    }

    // Обновляем дневную статистику
    stats.todayPomodoros += 1;
    stats.todayFocusMinutes += minutes;

    // Обновляем недельную статистику
    stats.weekPomodoros += 1;
    stats.weekFocusMinutes += minutes;
    stats.weekFocusCoins += coins;

    await db.updateUserStats(userId, stats);
  }

  /**
   * Получает понедельник текущей недели
   */
  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  /**
   * Сбрасывает дневную статистику (вызывается каждый день в 00:00)
   */
  async resetDailyStats(): Promise<void> {
    const users = await db.getAllUsers();
    
    for (const user of users) {
      const stats = await db.getUserStats(user.id);
      if (stats) {
        stats.todayPomodoros = 0;
        stats.todayFocusMinutes = 0;
        await db.updateUserStats(user.id, stats);
      }
    }
  }

  /**
   * Сбрасывает недельную статистику (вызывается каждый понедельник в 00:00)
   */
  async resetWeeklyStats(): Promise<void> {
    const users = await db.getAllUsers();
    
    for (const user of users) {
      const stats = await db.getUserStats(user.id);
      if (stats) {
        stats.weekPomodoros = 0;
        stats.weekFocusMinutes = 0;
        stats.weekTasksCompleted = 0;
        stats.weekFocusCoins = 0;
        await db.updateUserStats(user.id, stats);
      }
    }
  }

  /**
   * Получает историю сессий пользователя
   */
  async getSessionHistory(userId: string, limit: number = 10): Promise<PomodoroSession[]> {
    const sessions = await db.getUserSessions(userId);
    return sessions.slice(0, limit);
  }
}

export const pomodoroService = new PomodoroService();

