import { Pool, PoolClient } from 'pg';
import {
  User, Task, Pod, PomodoroSession, BotState, UserStats, Notification
} from '../types';

class PostgresDatabase {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'focus_pods',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          max_user_id VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          focus_coins INTEGER DEFAULT 0,
          total_pomodoros INTEGER DEFAULT 0,
          total_focus_minutes INTEGER DEFAULT 0,
          completed_tasks INTEGER DEFAULT 0,
          current_streak INTEGER DEFAULT 0,
          best_streak INTEGER DEFAULT 0,
          last_active_date VARCHAR(50),
          achievements TEXT[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_max_id ON users(max_user_id);

        CREATE TABLE IF NOT EXISTS tasks (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          deadline TIMESTAMP,
          completed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          parent_task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

        CREATE TABLE IF NOT EXISTS pods (
          id VARCHAR(36) PRIMARY KEY,
          invite_code VARCHAR(20) UNIQUE NOT NULL,
          creator_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          duration INTEGER NOT NULL,
          participants JSONB NOT NULL,
          start_time TIMESTAMP,
          end_time TIMESTAMP,
          status VARCHAR(20) NOT NULL,
          share_link TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_pods_invite ON pods(invite_code);
        CREATE INDEX IF NOT EXISTS idx_pods_status ON pods(status);

        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          duration INTEGER NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          completed BOOLEAN DEFAULT FALSE,
          task_action VARCHAR(20),
          pod_id VARCHAR(36) REFERENCES pods(id) ON DELETE SET NULL,
          reward INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON pomodoro_sessions(user_id);

        CREATE TABLE IF NOT EXISTS bot_states (
          user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          chat_id VARCHAR(50) NOT NULL,
          state VARCHAR(50) NOT NULL,
          data JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          read BOOLEAN DEFAULT FALSE
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

        CREATE TABLE IF NOT EXISTS user_stats (
          user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          week_pomodoros INTEGER DEFAULT 0,
          week_focus_minutes INTEGER DEFAULT 0,
          week_tasks_completed INTEGER DEFAULT 0,
          week_focus_coins INTEGER DEFAULT 0,
          today_pomodoros INTEGER DEFAULT 0,
          today_focus_minutes INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } finally {
      client.release();
    }
  }

  async getUser(userId: string): Promise<User | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : undefined;
  }

  async getUserByMaxId(maxUserId: string): Promise<User | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE max_user_id = $1',
      [maxUserId]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : undefined;
  }

  async createUser(user: User): Promise<User> {
    await this.pool.query(
      `INSERT INTO users (id, max_user_id, name, focus_coins, total_pomodoros, 
       total_focus_minutes, completed_tasks, current_streak, best_streak, 
       last_active_date, achievements, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [user.id, user.maxUserId, user.name, user.focusCoins, user.totalPomodoros,
       user.totalFocusMinutes, user.completedTasks, user.currentStreak, user.bestStreak,
       user.lastActiveDate, user.achievements, user.createdAt]
    );
    return user;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      fields.push(`${snakeKey} = $${index}`);
      values.push(value);
      index++;
    });

    if (fields.length === 0) return this.getUser(userId);

    values.push(userId);
    const result = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await this.pool.query('SELECT * FROM users');
    return result.rows.map(row => this.mapUser(row));
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM tasks WHERE id = $1',
      [taskId]
    );
    return result.rows[0] ? this.mapTask(result.rows[0]) : undefined;
  }

  async getUserTasks(userId: string, includeCompleted = false): Promise<Task[]> {
    const query = includeCompleted
      ? 'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM tasks WHERE user_id = $1 AND completed = FALSE ORDER BY deadline ASC NULLS LAST, created_at DESC';
    
    const result = await this.pool.query(query, [userId]);
    return result.rows.map(row => this.mapTask(row));
  }

  async createTask(task: Task): Promise<Task> {
    await this.pool.query(
      `INSERT INTO tasks (id, user_id, title, deadline, completed, created_at, parent_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [task.id, task.userId, task.title, task.deadline, task.completed, task.createdAt, task.parentTaskId]
    );
    return task;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const snakeKey = key === 'parentTaskId' ? 'parent_task_id' : 
                       key === 'completedAt' ? 'completed_at' :
                       key === 'userId' ? 'user_id' :
                       key === 'createdAt' ? 'created_at' : key;
      fields.push(`${snakeKey} = $${index}`);
      values.push(value);
      index++;
    });

    if (fields.length === 0) return this.getTask(taskId);

    values.push(taskId);
    const result = await this.pool.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapTask(result.rows[0]) : undefined;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    return (result.rowCount || 0) > 0;
  }

  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    const result = await this.pool.query(
      'SELECT * FROM tasks WHERE parent_task_id = $1 ORDER BY created_at ASC',
      [parentTaskId]
    );
    return result.rows.map(row => this.mapTask(row));
  }

  async getPod(podId: string): Promise<Pod | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM pods WHERE id = $1',
      [podId]
    );
    return result.rows[0] ? this.mapPod(result.rows[0]) : undefined;
  }

  async createPod(pod: Pod): Promise<Pod> {
    await this.pool.query(
      `INSERT INTO pods (id, invite_code, creator_id, title, duration, participants, 
       start_time, end_time, status, share_link, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [pod.id, pod.inviteCode, pod.creatorId, pod.title, pod.duration,
       JSON.stringify(pod.participants), pod.startTime, pod.endTime,
       pod.status, pod.shareLink, pod.createdAt]
    );
    return pod;
  }

  async updatePod(podId: string, updates: Partial<Pod>): Promise<Pod | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const snakeKey = key === 'inviteCode' ? 'invite_code' :
                       key === 'creatorId' ? 'creator_id' :
                       key === 'startTime' ? 'start_time' :
                       key === 'endTime' ? 'end_time' :
                       key === 'shareLink' ? 'share_link' :
                       key === 'createdAt' ? 'created_at' : key;
      
      if (key === 'participants') {
        fields.push(`${snakeKey} = $${index}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${snakeKey} = $${index}`);
        values.push(value);
      }
      index++;
    });

    if (fields.length === 0) return this.getPod(podId);

    values.push(podId);
    const result = await this.pool.query(
      `UPDATE pods SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapPod(result.rows[0]) : undefined;
  }

  async getUserPods(userId: string): Promise<Pod[]> {
    const result = await this.pool.query(
      `SELECT * FROM pods WHERE participants @> $1::jsonb ORDER BY created_at DESC`,
      [JSON.stringify([{userId}])]
    );
    return result.rows.map(row => this.mapPod(row));
  }

  async getActivePods(): Promise<Pod[]> {
    const result = await this.pool.query(
      `SELECT * FROM pods WHERE status IN ('active', 'waiting')`
    );
    return result.rows.map(row => this.mapPod(row));
  }

  async getAllPods(): Promise<Pod[]> {
    const result = await this.pool.query('SELECT * FROM pods');
    return result.rows.map(row => this.mapPod(row));
  }

  async getPodByInviteCode(inviteCode: string): Promise<Pod | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM pods WHERE invite_code = $1',
      [inviteCode]
    );
    return result.rows[0] ? this.mapPod(result.rows[0]) : undefined;
  }

  async getSession(sessionId: string): Promise<PomodoroSession | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM pomodoro_sessions WHERE id = $1',
      [sessionId]
    );
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  async createSession(session: PomodoroSession): Promise<PomodoroSession> {
    await this.pool.query(
      `INSERT INTO pomodoro_sessions (id, user_id, duration, start_time, end_time, 
       completed, task_action, pod_id, reward)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [session.id, session.userId, session.duration, session.startTime, session.endTime,
       session.completed, session.taskAction, session.podId, session.reward]
    );
    return session;
  }

  async updateSession(sessionId: string, updates: Partial<PomodoroSession>): Promise<PomodoroSession | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const snakeKey = key === 'userId' ? 'user_id' :
                       key === 'startTime' ? 'start_time' :
                       key === 'endTime' ? 'end_time' :
                       key === 'taskAction' ? 'task_action' :
                       key === 'podId' ? 'pod_id' : key;
      fields.push(`${snakeKey} = $${index}`);
      values.push(value);
      index++;
    });

    if (fields.length === 0) return this.getSession(sessionId);

    values.push(sessionId);
    const result = await this.pool.query(
      `UPDATE pomodoro_sessions SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );

    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  async getUserSessions(userId: string): Promise<PomodoroSession[]> {
    const result = await this.pool.query(
      'SELECT * FROM pomodoro_sessions WHERE user_id = $1 ORDER BY start_time DESC',
      [userId]
    );
    return result.rows.map(row => this.mapSession(row));
  }

  async getBotState(userId: string): Promise<BotState | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM bot_states WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] ? this.mapBotState(result.rows[0]) : undefined;
  }

  async setBotState(state: BotState): Promise<BotState> {
    await this.pool.query(
      `INSERT INTO bot_states (user_id, chat_id, state, data, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
       chat_id = $2, state = $3, data = $4, updated_at = $5`,
      [state.userId, state.chatId, state.state, JSON.stringify(state.data), state.updatedAt]
    );
    return state;
  }

  async clearBotState(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM bot_states WHERE user_id = $1',
      [userId]
    );
    return (result.rowCount || 0) > 0;
  }

  async createNotification(notification: Notification): Promise<Notification> {
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, type, message, sent_at, read)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [notification.id, notification.userId, notification.type, notification.message,
       notification.sentAt, notification.read]
    );
    return notification;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    const result = await this.pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC',
      [userId]
    );
    return result.rows.map(row => this.mapNotification(row));
  }

  async getUserStats(userId: string): Promise<UserStats | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] ? this.mapUserStats(result.rows[0]) : undefined;
  }

  async updateUserStats(userId: string, stats: Partial<UserStats>): Promise<UserStats> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    Object.entries(stats).forEach(([key, value]) => {
      // Пропускаем userId, т.к. это PRIMARY KEY
      if (key === 'userId') return;
      
      const snakeKey = key === 'weekPomodoros' ? 'week_pomodoros' :
                       key === 'weekFocusMinutes' ? 'week_focus_minutes' :
                       key === 'weekTasksCompleted' ? 'week_tasks_completed' :
                       key === 'weekFocusCoins' ? 'week_focus_coins' :
                       key === 'todayPomodoros' ? 'today_pomodoros' :
                       key === 'todayFocusMinutes' ? 'today_focus_minutes' : key;
      fields.push(`${snakeKey} = $${index}`);
      values.push(value);
      index++;
    });

    values.push(userId);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await this.pool.query(
      `INSERT INTO user_stats (user_id, ${Object.keys(stats).filter(k => k !== 'userId').map(key => 
        key === 'weekPomodoros' ? 'week_pomodoros' :
        key === 'weekFocusMinutes' ? 'week_focus_minutes' :
        key === 'weekTasksCompleted' ? 'week_tasks_completed' :
        key === 'weekFocusCoins' ? 'week_focus_coins' :
        key === 'todayPomodoros' ? 'today_pomodoros' :
        key === 'todayFocusMinutes' ? 'today_focus_minutes' : key
      ).join(', ')})
       VALUES ($${index}, ${Array.from({length: index - 1}, (_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${fields.join(', ')}
       RETURNING *`,
      values
    );

    return this.mapUserStats(result.rows[0]);
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      maxUserId: row.max_user_id,
      name: row.name,
      focusCoins: row.focus_coins,
      totalPomodoros: row.total_pomodoros,
      totalFocusMinutes: row.total_focus_minutes,
      completedTasks: row.completed_tasks,
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
      lastActiveDate: row.last_active_date,
      achievements: row.achievements || [],
      createdAt: new Date(row.created_at)
    };
  }

  private mapTask(row: any): Task {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      completed: row.completed,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      parentTaskId: row.parent_task_id
    };
  }

  private mapPod(row: any): Pod {
    return {
      id: row.id,
      inviteCode: row.invite_code,
      creatorId: row.creator_id,
      title: row.title,
      duration: row.duration,
      participants: typeof row.participants === 'string' ? JSON.parse(row.participants) : row.participants,
      startTime: row.start_time ? new Date(row.start_time) : undefined,
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      status: row.status,
      shareLink: row.share_link,
      createdAt: new Date(row.created_at)
    };
  }

  private mapSession(row: any): PomodoroSession {
    return {
      id: row.id,
      userId: row.user_id,
      duration: row.duration,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      completed: row.completed,
      taskAction: row.task_action,
      podId: row.pod_id,
      reward: row.reward
    };
  }

  private mapBotState(row: any): BotState {
    return {
      userId: row.user_id,
      chatId: row.chat_id,
      state: row.state,
      data: row.data,
      updatedAt: new Date(row.updated_at)
    };
  }

  async markNotificationRead(notificationId: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1',
      [notificationId]
    );
    return (result.rowCount || 0) > 0;
  }

  private mapNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      message: row.message,
      sentAt: new Date(row.sent_at),
      read: row.read
    };
  }

  private mapUserStats(row: any): UserStats {
    return {
      userId: row.user_id,
      weekPomodoros: row.week_pomodoros,
      weekFocusMinutes: row.week_focus_minutes,
      weekTasksCompleted: row.week_tasks_completed,
      weekFocusCoins: row.week_focus_coins,
      todayPomodoros: row.today_pomodoros,
      todayFocusMinutes: row.today_focus_minutes
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PostgresDatabase;

