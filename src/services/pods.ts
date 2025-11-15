/**
 * Сервис Focus Pods - совместные фокус-сессии
 */

import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { db } from '../storage';
import { Pod, PodStatus, PodParticipant, TaskAction, NotificationType } from '../types';
import { pomodoroService } from './pomodoro';
import { gamificationService } from './gamification';

export class PodService {
  private botUsername: string;

  constructor() {
    this.botUsername = process.env.BOT_USERNAME || 't257_hakaton_bot';
  }

  /**
   * Создает новый Pod с уникальным invite code
   */
  async createPod(
    creatorId: string, 
    creatorName: string,
    duration: number,
    title?: string
  ): Promise<{ pod: Pod; inviteCode: string }> {
    const podId = crypto.randomUUID();
    
    // Генерируем уникальный 8-символьный код приглашения (max 128 символов для payload)
    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Создаём MAX deep link согласно документации: https://max.ru/{botName}?start={payload}
    const shareLink = `https://max.ru/${this.botUsername}?start=pod_${inviteCode}`;

    const creator: PodParticipant = {
      userId: creatorId,
      userName: creatorName,
      joinedAt: new Date(),
      isCreator: true
    };

    const pod: Pod = {
      id: podId,
      inviteCode,
      creatorId,
      title: title || `Фокус-Pod от ${creatorName}`,
      duration,
      participants: [creator],
      status: PodStatus.WAITING,
      shareLink,
      createdAt: new Date()
    };

    await db.createPod(pod);

    // Проверяем достижение "Pod Pioneer"
    await gamificationService.checkAchievements(creatorId);

    return { pod, inviteCode };
  }

  /**
   * Находит Pod по invite code
   */
  async findPodByInviteCode(inviteCode: string): Promise<Pod | null> {
    const pod = await db.getPodByInviteCode(inviteCode);
    return pod || null;
  }

  /**
   * Получает активный Pod пользователя
   */
  async getUserActivePod(userId: string): Promise<Pod | null> {
    const allPods = await db.getAllPods();
    return allPods.find(pod => 
      (pod.status === PodStatus.ACTIVE || pod.status === PodStatus.WAITING) &&
      pod.participants.some(p => p.userId === userId)
    ) || null;
  }

  async getUserWaitingPod(userId: string): Promise<Pod | null> {
    const allPods = await db.getAllPods();
    return allPods.find(pod => 
      pod.status === PodStatus.WAITING &&
      pod.participants.some(p => p.userId === userId)
    ) || null;
  }

  /**
   * Присоединение к Pod
   */
  async joinPod(podId: string, userId: string, userName: string): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    if (pod.status !== PodStatus.WAITING) {
      throw new Error('Pod already started or completed');
    }

    // Проверяем, не присоединился ли уже
    const alreadyJoined = pod.participants.some(p => p.userId === userId);
    if (alreadyJoined) {
      return pod;
    }

    // Добавляем участника
    const participant: PodParticipant = {
      userId,
      userName,
      joinedAt: new Date(),
      isCreator: false
    };

    pod.participants.push(participant);
    await db.updatePod(podId, { participants: pod.participants });

    // Уведомляем создателя
    await db.createNotification({
      id: crypto.randomUUID(),
      userId: pod.creatorId,
      type: NotificationType.POD_INVITE,
      message: `${userName} присоединился к твоему Pod'у! Участников: ${pod.participants.length}`,
      sentAt: new Date(),
      read: false
    });

    return pod;
  }

  /**
   * Запускает Pod сессию
   */
  async startPod(podId: string): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    if (pod.status !== PodStatus.WAITING) {
      throw new Error('Pod already started');
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + pod.duration * 60 * 1000);

    await db.updatePod(podId, {
      status: PodStatus.ACTIVE,
      startTime,
      endTime
    });

    // Создаем Pomodoro сессии для всех участников
    for (const participant of pod.participants) {
      await pomodoroService.startSession(participant.userId, pod.duration, podId);
    }

    // Уведомляем всех участников
    for (const participant of pod.participants) {
      if (participant.userId !== pod.creatorId) {
        await db.createNotification({
          id: crypto.randomUUID(),
          userId: participant.userId,
          type: NotificationType.POD_STARTED,
          message: `Pod "${pod.title}" начался! Фокусируемся ${pod.duration} минут 🎯`,
          sentAt: new Date(),
          read: false
        });
      }
    }

    return pod;
  }

  /**
   * Завершает Pod сессию
   */
  async completePod(podId: string): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    if (pod.status !== PodStatus.ACTIVE) {
      throw new Error('Pod is not active');
    }

    const updatedPod = await db.updatePod(podId, {
      status: PodStatus.COMPLETED,
      endTime: new Date()
    });

    if (!updatedPod) throw new Error('Failed to complete pod');

    // Уведомляем всех участников
    for (const participant of pod.participants) {
      await db.createNotification({
        id: crypto.randomUUID(),
        userId: participant.userId,
        type: NotificationType.POD_COMPLETED,
        message: `Pod "${pod.title}" завершён! 🎉 Что ты успел сделать?`,
        sentAt: new Date(),
        read: false
      });
    }

    return updatedPod;
  }

  /**
   * Обновляет действие участника после завершения
   */
  async updateParticipantAction(
    podId: string, 
    userId: string, 
    action: TaskAction
  ): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    const participantIndex = pod.participants.findIndex(p => p.userId === userId);
    if (participantIndex === -1) throw new Error('Participant not found');

    pod.participants[participantIndex].taskAction = action;
    
    if (action === TaskAction.COMPLETED) {
      pod.participants[participantIndex].taskCompleted = true;
    }

    await db.updatePod(podId, { participants: pod.participants });

    return pod;
  }

  /**
   * Получает Pod по ID
   */
  async getPod(podId: string): Promise<Pod | undefined> {
    return db.getPod(podId);
  }

  /**
   * Получает активные Pod'ы пользователя
   */
  async getUserActivePods(userId: string): Promise<Pod[]> {
    const pods = await db.getUserPods(userId);
    return pods.filter(p => p.status === PodStatus.WAITING || p.status === PodStatus.ACTIVE);
  }

  /**
   * Получает информацию о Pod с оставшимся временем
   */
  async getPodInfo(podId: string): Promise<{
    pod: Pod;
    remainingMinutes?: number;
    remainingSeconds?: number;
  } | undefined> {
    const pod = await db.getPod(podId);
    if (!pod) return undefined;

    if (pod.status === PodStatus.ACTIVE && pod.endTime) {
      const remaining = Math.max(0, pod.endTime.getTime() - Date.now());
      const remainingMinutes = Math.floor(remaining / (60 * 1000));
      const remainingSeconds = Math.floor((remaining % (60 * 1000)) / 1000);

      return { pod, remainingMinutes, remainingSeconds };
    }

    return { pod };
  }

  /**
   * Генерирует QR-код для Pod
   */
  private async generateQRCode(data: string): Promise<string> {
    try {
      return await QRCode.toDataURL(data, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw error;
    }
  }

  /**
   * Форматирует информацию о Pod для отображения
   */
  formatPodInfo(pod: Pod, includeParticipants = true): string {
    let text = `🎯 ${pod.title}\n`;
    text += `⏱️ Длительность: ${pod.duration} минут\n`;
    
    if (pod.status === PodStatus.WAITING) {
      text += `📍 Статус: Ожидание участников\n`;
    } else if (pod.status === PodStatus.ACTIVE) {
      text += `🔥 Статус: Активный\n`;
      if (pod.endTime) {
        const remaining = Math.max(0, pod.endTime.getTime() - Date.now());
        const minutes = Math.floor(remaining / (60 * 1000));
        const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
        text += `⏰ Осталось: ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
      }
    } else if (pod.status === PodStatus.COMPLETED) {
      text += `✅ Статус: Завершён\n`;
    }

    if (includeParticipants) {
      text += `\n👥 Участники (${pod.participants.length}):\n`;
      pod.participants.forEach(p => {
        const emoji = p.isCreator ? '✨' : '📍';
        let line = `  ${emoji} ${p.userName}`;
        if (p.taskCompleted !== undefined) {
          line += p.taskCompleted ? ' ✅' : ' ⏸️';
        }
        text += line + '\n';
      });
    }

    return text;
  }

  /**
   * Отменяет Pod
   */
  async cancelPod(podId: string): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    await db.updatePod(podId, {
      status: PodStatus.CANCELLED
    });

    // Уведомляем участников
    for (const participant of pod.participants) {
      if (participant.userId !== pod.creatorId) {
        await db.createNotification({
          id: crypto.randomUUID(),
          userId: participant.userId,
          type: NotificationType.POD_INVITE,
          message: `Pod "${pod.title}" был отменён`,
          sentAt: new Date(),
          read: false
        });
      }
    }

    return pod;
  }

  /**
   * Покинуть Pod
   */
  async leavePod(podId: string, userId: string): Promise<Pod> {
    const pod = await db.getPod(podId);
    if (!pod) throw new Error('Pod not found');

    if (pod.creatorId === userId) {
      throw new Error('Creator cannot leave the pod. Cancel it instead.');
    }

    pod.participants = pod.participants.filter(p => p.userId !== userId);
    await db.updatePod(podId, { participants: pod.participants });

    return pod;
  }

  /**
   * Получает статистику по Pod'ам пользователя
   */
  async getUserPodStats(userId: string): Promise<any> {
    const pods = await db.getUserPods(userId);
    
    const created = pods.filter(p => p.creatorId === userId).length;
    const participated = pods.length;
    const completed = pods.filter(p => p.status === PodStatus.COMPLETED).length;
    const active = pods.filter(p => p.status === PodStatus.ACTIVE).length;

    return {
      created,
      participated,
      completed,
      active
    };
  }
}

export const podService = new PodService();

