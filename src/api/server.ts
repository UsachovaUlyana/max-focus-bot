/**
 * REST API сервер для мини-приложения
 */

import express, { Request, Response } from 'express';
import { db } from '../storage';
import { taskService } from '../services/tasks';
import { pomodoroService } from '../services/pomodoro';
import { podService } from '../services/pods';
import { gamificationService } from '../services/gamification';
import { TaskAction } from '../types';

const app = express();

// Middleware
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// === USER ENDPOINTS ===

// Получить профиль пользователя
app.get('/api/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await db.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await gamificationService.getUserGameStats(userId);
    
    res.json({ user, stats });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});

// === TASK ENDPOINTS ===

// Получить все задачи пользователя
app.get('/api/tasks/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const includeCompleted = req.query.completed === 'true';
    
    const tasks = await taskService.getUserTasks(userId, includeCompleted);
    
    res.json({ tasks });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать задачу
app.post('/api/tasks', async (req: Request, res: Response) => {
  try {
    const { userId, title, deadline } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }

    const deadlineDate = deadline ? new Date(deadline) : undefined;
    const task = await taskService.createTask(userId, title, deadlineDate);
    
    res.status(201).json({ task });
  } catch (error: any) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить задачу
app.patch('/api/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { action, ...updates } = req.body;
    
    let task;

    if (action === 'complete') {
      task = await taskService.completeTask(taskId);
    } else if (action === 'split') {
      const subtasks = await taskService.splitTask(taskId);
      return res.json({ task: await taskService.getTask(taskId), subtasks });
    } else if (action === 'postpone') {
      const hours = updates.hours || 24;
      task = await taskService.postponeTask(taskId, hours);
    } else {
      task = await taskService.updateTask(taskId, updates);
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (error: any) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удалить задачу
app.delete('/api/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const deleted = await taskService.deleteTask(taskId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

// === POMODORO ENDPOINTS ===

// Начать Pomodoro сессию
app.post('/api/pomodoro/start', async (req: Request, res: Response) => {
  try {
    const { userId, duration, podId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const session = await pomodoroService.startSession(
      userId, 
      duration || 25, 
      podId
    );
    
    res.status(201).json({ session });
  } catch (error: any) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Завершить Pomodoro сессию
app.post('/api/pomodoro/:sessionId/complete', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { taskAction } = req.body;
    
    const result = await pomodoroService.completeSession(
      sessionId, 
      taskAction as TaskAction
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить активную сессию
app.get('/api/pomodoro/active/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const session = await pomodoroService.getActiveSession(userId);
    
    if (!session) {
      return res.status(404).json({ error: 'No active session' });
    }

    const info = await pomodoroService.getSessionInfo(session.id);
    
    res.json(info);
  } catch (error: any) {
    console.error('Error fetching active session:', error);
    res.status(500).json({ error: error.message });
  }
});

// === POD ENDPOINTS ===

// Получить информацию о Pod
app.get('/api/pods/:podId', async (req: Request, res: Response) => {
  try {
    const { podId } = req.params;
    const podInfo = await podService.getPodInfo(podId);
    
    if (!podInfo) {
      return res.status(404).json({ error: 'Pod not found' });
    }

    res.json(podInfo);
  } catch (error: any) {
    console.error('Error fetching pod:', error);
    res.status(500).json({ error: error.message });
  }
});

// Создать Pod
app.post('/api/pods', async (req: Request, res: Response) => {
  try {
    const { creatorId, creatorName, duration, title } = req.body;
    
    if (!creatorId || !creatorName || !duration) {
      return res.status(400).json({ 
        error: 'creatorId, creatorName, and duration are required' 
      });
    }

    const result = await podService.createPod(
      creatorId, 
      creatorName, 
      duration, 
      title
    );
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating pod:', error);
    res.status(500).json({ error: error.message });
  }
});

// Присоединиться к Pod
app.post('/api/pods/:podId/join', async (req: Request, res: Response) => {
  try {
    const { podId } = req.params;
    const { userId, userName } = req.body;
    
    if (!userId || !userName) {
      return res.status(400).json({ error: 'userId and userName are required' });
    }

    const pod = await podService.joinPod(podId, userId, userName);
    
    res.json({ pod });
  } catch (error: any) {
    console.error('Error joining pod:', error);
    res.status(500).json({ error: error.message });
  }
});

// Запустить Pod
app.post('/api/pods/:podId/start', async (req: Request, res: Response) => {
  try {
    const { podId } = req.params;
    const pod = await podService.startPod(podId);
    
    res.json({ pod });
  } catch (error: any) {
    console.error('Error starting pod:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновить действие участника
app.patch('/api/pods/:podId/participant/:userId', async (req: Request, res: Response) => {
  try {
    const { podId, userId } = req.params;
    const { action } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const pod = await podService.updateParticipantAction(
      podId, 
      userId, 
      action as TaskAction
    );
    
    res.json({ pod });
  } catch (error: any) {
    console.error('Error updating participant:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить Pod'ы пользователя
app.get('/api/pods/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const active = req.query.active === 'true';
    
    const pods = active 
      ? await podService.getUserActivePods(userId)
      : await db.getUserPods(userId);
    
    res.json({ pods });
  } catch (error: any) {
    console.error('Error fetching user pods:', error);
    res.status(500).json({ error: error.message });
  }
});

// === ACHIEVEMENT ENDPOINTS ===

// Получить все достижения пользователя
app.get('/api/achievements/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const achievements = await gamificationService.getAchievementsWithProgress(userId);
    
    res.json({ achievements });
  } catch (error: any) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить статистику пользователя
app.get('/api/stats/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const stats = await gamificationService.getUserGameStats(userId);
    
    res.json({ stats });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// === HEALTH CHECK ===

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Главная страница (редирект на Pod)
app.get('/pod/:podId', (req: Request, res: Response) => {
  const { podId } = req.params;
  // Здесь можно отдать HTML страницу с мини-приложением
  // Или просто редирект на MAX
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MAX Focus Pod</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <h1>🎯 Focus Pod</h1>
      <p>Pod ID: ${podId}</p>
      <p>Открой этот Pod в боте MAX Focus Pods!</p>
      <a href="https://max.ru">Открыть в MAX</a>
    </body>
    </html>
  `);
});

export function startApiServer(port: number = 3000): void {
  app.listen(port, () => {
    console.log(`✅ API server running on port ${port}`);
    console.log(`📡 Health check: http://localhost:${port}/health`);
  });
}

export { app };

