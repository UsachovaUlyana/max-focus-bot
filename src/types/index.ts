/**
 * Типы данных для MAX Focus Pods
 */

export interface User {
  id: string;
  maxUserId: string;
  name: string;
  focusCoins: number;
  totalPomodoros: number;
  totalFocusMinutes: number;
  completedTasks: number;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string;
  achievements: string[];
  createdAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  deadline?: Date;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  subtasks?: Task[];
  parentTaskId?: string;
  parentTitle?: string;
}

export interface Pod {
  id: string;
  inviteCode: string; // Уникальный код для приглашения (например: A4F2B9E1)
  creatorId: string;
  title: string;
  duration: number; // в минутах
  participants: PodParticipant[];
  startTime?: Date;
  endTime?: Date;
  status: PodStatus;
  qrCode?: string; // Deprecated - используем inviteCode + deep links
  shareLink: string; // max://max.ru/{bot_username}?start=pod_{inviteCode}
  createdAt: Date;
}

export interface PodParticipant {
  userId: string;
  userName: string;
  joinedAt: Date;
  isCreator: boolean;
  taskCompleted?: boolean;
  taskAction?: TaskAction;
}

export enum PodStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum TaskAction {
  COMPLETED = 'completed',
  SPLIT = 'split',
  POSTPONED = 'postponed',
  SKIPPED = 'skipped'
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: AchievementRequirement;
  reward: number; // FocusCoins
}

export interface AchievementRequirement {
  type: 'pomodoros' | 'tasks' | 'streak' | 'pods' | 'focus_hours';
  count: number;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  duration: number; // в минутах
  startTime: Date;
  endTime?: Date;
  completed: boolean;
  taskAction?: TaskAction;
  podId?: string;
  reward: number; // FocusCoins
}

export interface UserStats {
  userId: string;
  weekPomodoros: number;
  weekFocusMinutes: number;
  weekTasksCompleted: number;
  weekFocusCoins: number;
  todayPomodoros: number;
  todayFocusMinutes: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  sentAt: Date;
  read: boolean;
}

export enum NotificationType {
  DAILY_REMINDER = 'daily_reminder',
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  STREAK_WARNING = 'streak_warning',
  WEEKLY_STATS = 'weekly_stats',
  POD_INVITE = 'pod_invite',
  POD_STARTED = 'pod_started',
  POD_COMPLETED = 'pod_completed'
}

export interface BotState {
  userId: string;
  chatId: string;
  state: string;
  data?: any;
  updatedAt: Date;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_focus',
    name: 'First Focus',
    description: 'Завершил первую Pomodoro-сессию',
    icon: '🎯',
    requirement: { type: 'pomodoros', count: 1 },
    reward: 5
  },
  {
    id: 'focus_streak_3',
    name: 'Focus Streak 3',
    description: '3 дня подряд с фокус-сессиями',
    icon: '🔥',
    requirement: { type: 'streak', count: 3 },
    reward: 10
  },
  {
    id: 'focus_streak_7',
    name: 'Focus Streak 7',
    description: '7 дней подряд с фокус-сессиями',
    icon: '🔥🔥',
    requirement: { type: 'streak', count: 7 },
    reward: 25
  },
  {
    id: 'task_master',
    name: 'Task Master',
    description: 'Выполнил 10 задач',
    icon: '✅',
    requirement: { type: 'tasks', count: 10 },
    reward: 15
  },
  {
    id: 'pod_pioneer',
    name: 'Pod Pioneer',
    description: 'Создал первый Pod',
    icon: '🚀',
    requirement: { type: 'pods', count: 1 },
    reward: 10
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: '5 часов фокуса',
    icon: '🌅',
    requirement: { type: 'focus_hours', count: 5 },
    reward: 20
  },
  {
    id: 'focus_master',
    name: 'Focus Master',
    description: '25 Pomodoro-сессий',
    icon: '🏆',
    requirement: { type: 'pomodoros', count: 25 },
    reward: 50
  },
  {
    id: 'marathon_runner',
    name: 'Marathon Runner',
    description: '50 часов фокуса',
    icon: '🎖️',
    requirement: { type: 'focus_hours', count: 50 },
    reward: 100
  }
];

