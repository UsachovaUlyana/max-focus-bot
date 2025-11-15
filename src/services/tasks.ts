/**
 * Сервис управления задачами
 */

import * as crypto from 'crypto';
import { db } from '../storage';
import { Task, TaskAction } from '../types';
import { gamificationService } from './gamification';

export class TaskService {
  /**
   * Создает новую задачу
   */
  async createTask(userId: string, title: string, deadline?: Date): Promise<Task> {
    const task: Task = {
      id: crypto.randomUUID(),
      userId,
      title,
      deadline,
      completed: false,
      createdAt: new Date()
    };

    await db.createTask(task);
    return task;
  }

  /**
   * Парсит задачу из текста (формат: "Название до дд.мм чч:мм")
   */
  parseTaskFromText(text: string): { title: string; deadline?: Date } {
    // Паттерны для парсинга дедлайна
    const patterns = [
      // "до 20.11 12:00"
      /до\s+(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})/i,
      // "до 20.11"
      /до\s+(\d{1,2})\.(\d{1,2})/i,
      // "завтра"
      /завтра/i,
      // "сегодня"
      /сегодня/i
    ];

    let deadline: Date | undefined;
    let title = text.trim();

    // Проверяем паттерн с временем
    const timeMatch = text.match(patterns[0]);
    if (timeMatch) {
      const day = parseInt(timeMatch[1]);
      const month = parseInt(timeMatch[2]) - 1; // месяцы с 0
      const hour = parseInt(timeMatch[3]);
      const minute = parseInt(timeMatch[4]);
      const year = new Date().getFullYear();
      
      deadline = new Date(year, month, day, hour, minute);
      title = text.replace(patterns[0], '').trim();
    } else {
      // Проверяем паттерн только с датой
      const dateMatch = text.match(patterns[1]);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1;
        const year = new Date().getFullYear();
        
        deadline = new Date(year, month, day, 23, 59);
        title = text.replace(patterns[1], '').trim();
      } else if (text.match(patterns[2])) {
        // Завтра
        deadline = new Date();
        deadline.setDate(deadline.getDate() + 1);
        deadline.setHours(23, 59, 0, 0);
        title = text.replace(patterns[2], '').trim();
      } else if (text.match(patterns[3])) {
        // Сегодня
        deadline = new Date();
        deadline.setHours(23, 59, 0, 0);
        title = text.replace(patterns[3], '').trim();
      }
    }

    return { title, deadline };
  }

  /**
   * Получает список задач пользователя
   */
  async getUserTasks(
    userId: string,
    includeCompleted = false,
    includeSubtasks = true
  ): Promise<Task[]> {
    let tasks = await db.getUserTasks(userId, includeSubtasks);
    
    if (includeSubtasks) {
      const parentIds = Array.from(
        new Set(
          tasks
            .filter(t => t.parentTaskId)
            .map(t => t.parentTaskId as string)
        )
      );
      
      if (parentIds.length > 0) {
        const parentEntries = await Promise.all(
          parentIds.map(async (id) => {
            const parentTask = await db.getTask(id);
            return parentTask ? [id, parentTask.title] as const : null;
          })
        );
        const parentMap = new Map<string, string>();
        parentEntries.forEach(entry => {
          if (entry) parentMap.set(entry[0], entry[1]);
        });
        
        tasks = tasks.map(task => task.parentTaskId
          ? { ...task, parentTitle: parentMap.get(task.parentTaskId) }
          : task
        );
      }
    }
    
    if (!includeCompleted) {
      return tasks.filter(t => !t.completed);
    }
    
    return tasks;
  }

  /**
   * Получает задачу по ID
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    return db.getTask(taskId);
  }

  /**
   * Отмечает задачу как выполненную
   */
  async completeTask(taskId: string): Promise<Task | undefined> {
    const task = await db.getTask(taskId);
    if (!task) return undefined;

    const updated = await db.updateTask(taskId, {
      completed: true,
      completedAt: new Date()
    });

    if (updated) {
      // Обновляем статистику пользователя
      const user = await db.getUser(task.userId);
      if (user) {
        await db.updateUser(task.userId, {
          completedTasks: user.completedTasks + 1
        });

        // Награждаем FocusCoins
        await gamificationService.awardFocusCoins(task.userId, 2, 'Task completed');

        // Проверяем достижения
        await gamificationService.checkAchievements(task.userId);
      }
    }

    return updated;
  }

  /**
   * Распиливает задачу на подзадачи
   */
  async splitTask(taskId: string, subtaskTitles?: string[]): Promise<Task[]> {
    const task = await db.getTask(taskId);
    if (!task) throw new Error('Task not found');

    // Если подзадачи не указаны, создаем стандартные
    const titles = subtaskTitles || [
      `${task.title} - Часть 1`,
      `${task.title} - Часть 2`,
      `${task.title} - Часть 3`
    ];

    const subtasks: Task[] = [];

    for (const title of titles) {
      const subtask: Task = {
        id: crypto.randomUUID(),
        userId: task.userId,
        title,
        deadline: task.deadline,
        completed: false,
        createdAt: new Date(),
        parentTaskId: taskId
      };

      await db.createTask(subtask);
      subtasks.push(subtask);
    }

    // Обновляем родительскую задачу
    await db.updateTask(taskId, {
      subtasks: subtasks.map(st => st.id) as any
    });

    return subtasks;
  }

  /**
   * Создаёт подзадачи с кастомными названиями
   */
  async createSubtasks(
    parentTaskId: string,
    subtaskTitles: string[],
    parentDeadline?: Date
  ): Promise<Task[]> {
    const parentTask = await db.getTask(parentTaskId);
    if (!parentTask) throw new Error('Parent task not found');

    const subtasks: Task[] = [];

    for (const title of subtaskTitles) {
      const subtask: Task = {
        id: crypto.randomUUID(),
        userId: parentTask.userId,
        title,
        completed: false,
        deadline: parentDeadline || parentTask.deadline, // Наследуем дедлайн
        parentTaskId: parentTaskId,
        createdAt: new Date()
      };

      await db.createTask(subtask);
      subtasks.push(subtask);
    }

    // Отмечаем родительскую задачу как завершённую
    await db.updateTask(parentTaskId, { completed: true });

    return subtasks;
  }

  /**
   * Откладывает задачу (переносит дедлайн)
   */
  async postponeTask(taskId: string, hours: number): Promise<Task | undefined> {
    const task = await db.getTask(taskId);
    if (!task) return undefined;

    const newDeadline = task.deadline 
      ? new Date(task.deadline.getTime() + hours * 60 * 60 * 1000)
      : new Date(Date.now() + hours * 60 * 60 * 1000);

    return db.updateTask(taskId, { deadline: newDeadline });
  }

  /**
   * Удаляет задачу
   */
  async deleteTask(taskId: string): Promise<boolean> {
    // Удаляем также подзадачи
    const subtasks = await db.getSubtasks(taskId);
    for (const subtask of subtasks) {
      await db.deleteTask(subtask.id);
    }

    return db.deleteTask(taskId);
  }

  /**
   * Обновляет задачу
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | undefined> {
    return db.updateTask(taskId, updates);
  }

  /**
   * Форматирует задачу для отображения
   */
  formatTask(task: Task, index?: number, parentTitle?: string): string {
    let text = '';
    
    if (index !== undefined) {
      text += `${index + 1}. `;
    }

    const isSubtask = Boolean(task.parentTaskId);
    
    if (task.completed) {
      text += '✅ ';
    } else if (isSubtask) {
      text += '  🔹 ';
    } else if (task.deadline) {
      text += '⏰ ';
    } else {
      text += '📌 ';
    }
    
    text += `*${task.title}*`;

    if (parentTitle) {
      text += `\n  └ _Из: ${parentTitle}_`;
    }

    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const now = new Date();
      const diffHours = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      let deadlineText = '';
      if (diffHours < 0) {
        deadlineText = ' ⚠️ Просрочено';
      } else if (diffHours < 2) {
        deadlineText = ' 🔥 Срочно (<2ч)';
      } else if (diffHours < 24) {
        deadlineText = ` ⏰ Сегодня ${deadline.getHours()}:${deadline.getMinutes().toString().padStart(2, '0')}`;
      } else if (diffHours < 48) {
        deadlineText = ' 📅 Завтра';
      } else {
        const day = deadline.getDate();
        const month = deadline.getMonth() + 1;
        deadlineText = ` 📅 ${day}.${month.toString().padStart(2, '0')}`;
      }
      
      text += deadlineText;
    }

    return text;
  }

  /**
   * Форматирует список задач
   */
  formatTaskList(tasks: Task[]): string {
    if (tasks.length === 0) {
      return 'У тебя пока нет задач. Добавь новую! 📝';
    }

    const activeTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);

    let text = `📋 Твои задачи (${activeTasks.length}):\n\n`;

    activeTasks.forEach((task, idx) => {
      text += this.formatTask(task, idx, task.parentTitle) + '\n';
    });

    if (completedTasks.length > 0 && completedTasks.length <= 5) {
      text += `\n✅ Выполнено (${completedTasks.length}):\n`;
      completedTasks.slice(0, 5).forEach((task) => {
        const prefix = task.parentTaskId ? '↳ ' : '';
        text += `  ${prefix}${task.title}\n`;
      });
    }

    return text;
  }

  /**
   * Получает подзадачи
   */
  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    return db.getSubtasks(parentTaskId);
  }

  /**
   * Получает статистику по задачам
   */
  async getTaskStats(userId: string): Promise<any> {
    const allTasks = await db.getUserTasks(userId, true);
    const activeTasks = allTasks.filter(t => !t.completed);
    const completedTasks = allTasks.filter(t => t.completed);
    const overdueTasks = activeTasks.filter(t => 
      t.deadline && new Date(t.deadline) < new Date()
    );

    return {
      total: allTasks.length,
      active: activeTasks.length,
      completed: completedTasks.length,
      overdue: overdueTasks.length
    };
  }
}

export const taskService = new TaskService();

