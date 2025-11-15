/**
 * Обработчики для работы с задачами
 */

import { Context, Keyboard } from '@maxhub/max-bot-api';
import { db } from '../../storage';
import { taskService } from '../../services/tasks';
import { messages } from '../messages';
import { 
  getBackToMenuKeyboard, 
  getTaskListKeyboard, 
  getTaskActionKeyboard 
} from '../keyboards';

export async function handleAddTask(ctx: Context): Promise<void> {
  try {
    // Получаем пользователя
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

    // Устанавливаем состояние ожидания задачи
    await db.setBotState({
      userId: user.id,
      chatId: String(ctx.chatId || userId),
      state: 'awaiting_task',
      updatedAt: new Date()
    });

    await ctx.answerOnCallback({
      message: {
        text: messages.addTaskPrompt,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleAddTask:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleTaskInput(ctx: Context, text: string): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.message?.sender?.user_id;
    if (!userId) return;

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) return;

    const { title, deadline } = taskService.parseTaskFromText(text);

    if (!title || title.length < 2) {
      await ctx.reply('Пожалуйста, укажи название задачи.\n\nНапример: "Написать отчет до завтра 15:00"');
      return;
    }

    await taskService.createTask(user.id, title, deadline);

    let deadlineText: string | undefined;
    if (deadline) {
      const day = deadline.getDate();
      const month = deadline.getMonth() + 1;
      const hours = deadline.getHours();
      const minutes = deadline.getMinutes();
      deadlineText = `${day}.${month.toString().padStart(2, '0')} ${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    await db.clearBotState(user.id);

    await ctx.reply(messages.taskAdded(title, deadlineText), {
      attachments: [getBackToMenuKeyboard()],
      format: 'markdown'
    });
  } catch (error) {
    await ctx.reply(messages.error);
  }
}

export async function handleMyTasks(ctx: Context): Promise<void> {
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

    const tasks = await taskService.getUserTasks(user.id, false);

    if (tasks.length === 0) {
      const replyOptions = {
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown' as const
      };
      
      if (ctx.callback) {
        await ctx.answerOnCallback({
          message: {
            text: messages.noTasks,
            ...replyOptions
          }
        });
      } else {
        await ctx.reply(messages.noTasks, replyOptions);
      }
      return;
    }

    const taskText = `📋 *Мои задачи* (${tasks.length})\n↳ Подзадачи отмечены стрелкой\n\nВыбери задачу:`;
    const totalPages = Math.ceil(tasks.length / 5);

    const replyOptions = {
      attachments: [getTaskListKeyboard(tasks, 0, totalPages)],
      format: 'markdown' as const
    };

    if (ctx.callback) {
      await ctx.answerOnCallback({
        message: {
          text: taskText,
          ...replyOptions
        }
      });
    } else {
      await ctx.reply(taskText, replyOptions);
    }
  } catch (error) {
    console.error('Error in handleMyTasks:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleTaskPage(ctx: Context, page: number): Promise<void> {
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

    const tasks = await taskService.getUserTasks(user.id, false);
    const totalPages = Math.ceil(tasks.length / 5);

    const taskText = `📋 *Мои задачи* (${tasks.length})\n↳ Подзадачи отмечены стрелкой\n\nВыбери задачу:`;

    await ctx.answerOnCallback({
      message: {
        text: taskText,
        attachments: [getTaskListKeyboard(tasks, page, totalPages)],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleTaskPage:', error);
    await ctx.answerOnCallback({ notification: messages.error });
  }
}

export async function handleTaskView(ctx: Context, taskId: string): Promise<void> {
  try {
    const task = await taskService.getTask(taskId);
    if (!task) {
      await ctx.answerOnCallback({
        notification: messages.taskNotFound
      });
      return;
    }

    const parentTask = task.parentTaskId ? await taskService.getTask(task.parentTaskId) : null;
    const subtasks = await taskService.getSubtasks(task.id);

    let taskText = `📋 *Задача*\n\n${taskService.formatTask(task, undefined, parentTask?.title)}`;

    if (parentTask) {
      taskText += `\n\n🔗 Родительская: *${parentTask.title}*`;
    }

    if (subtasks.length > 0) {
      const completedCount = subtasks.filter(st => st.completed).length;
      taskText += `\n\n🧩 *Подзадачи* (${completedCount}/${subtasks.length}):\n`;
      subtasks.forEach((subtask, idx) => {
        const emoji = subtask.completed ? '✅' : '🔹';
        taskText += `${emoji} ${subtask.title}\n`;
      });
    }

    await ctx.answerOnCallback({
      message: {
        text: taskText,
        attachments: [getTaskActionKeyboard(taskId)],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleTaskView:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleTaskAction(
  ctx: Context, 
  taskId: string, 
  action: string
): Promise<void> {
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
        notification: 'Пользователь не найден'
      });
      return;
    }

    const task = await taskService.getTask(taskId);
    if (!task) {
      await ctx.answerOnCallback({ notification: messages.taskNotFound });
      return;
    }

    switch (action) {
      case 'complete': {
        await taskService.completeTask(taskId);
        await ctx.answerOnCallback({
          message: {
            text: messages.taskCompleted(task.title, 2),
            attachments: [getBackToMenuKeyboard()],
            format: 'markdown'
          }
        });
        break;
      }

      case 'split': {
        // Начинаем интерактивный флоу декомпозиции
        await db.setBotState({
          userId: user.id,
          chatId: String(ctx.chatId || userId),
          state: 'splitting_task',
          data: { taskId },
          updatedAt: new Date()
        });

        await ctx.answerOnCallback({
          message: {
            text: `✂️ *Декомпозиция задачи*\n\n` +
                  `Задача: *${task.title}*\n\n` +
                  `На сколько подзадач хочешь разбить?`,
            attachments: [
              Keyboard.inlineKeyboard([
                [
                  Keyboard.button.callback('2', `task_split_count:${taskId}:2`),
                  Keyboard.button.callback('3', `task_split_count:${taskId}:3`),
                  Keyboard.button.callback('4', `task_split_count:${taskId}:4`),
                  Keyboard.button.callback('5', `task_split_count:${taskId}:5`)
                ],
                [Keyboard.button.callback('❌ Отмена', 'action:my_tasks')]
              ])
            ],
            format: 'markdown'
          }
        });
        break;
      }

      case 'postpone': {
        const postponed = await taskService.postponeTask(taskId, 24);
        if (postponed && postponed.deadline) {
          const day = postponed.deadline.getDate();
          const month = postponed.deadline.getMonth() + 1;
          const deadlineText = `${day}.${month.toString().padStart(2, '0')}`;
          
          await ctx.answerOnCallback({
            message: {
              text: messages.taskPostponed(task.title, deadlineText),
              attachments: [getBackToMenuKeyboard()],
              format: 'markdown'
            }
          });
        }
        break;
      }

      case 'delete': {
        await taskService.deleteTask(taskId);
        await ctx.answerOnCallback({
          message: {
            text: messages.taskDeleted,
            attachments: [getBackToMenuKeyboard()],
            format: 'markdown'
          }
        });
        break;
      }

      default:
        await ctx.answerOnCallback({ notification: 'Неизвестное действие' });
    }
  } catch (error) {
    console.error('Error in handleTaskAction:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleTaskSplitCount(
  ctx: Context,
  taskId: string,
  count: number
): Promise<void> {
  try {
    const userId = ctx.user?.user_id || ctx.callback?.user?.user_id;
    if (!userId) {
      await ctx.answerOnCallback({ notification: 'Не удалось определить пользователя' });
      return;
    }

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) {
      await ctx.answerOnCallback({ notification: 'Пользователь не найден' });
      return;
    }

    const task = await taskService.getTask(taskId);
    if (!task) {
      await ctx.answerOnCallback({ notification: messages.taskNotFound });
      return;
    }

    // Обновляем состояние
    await db.setBotState({
      userId: user.id,
      chatId: String(ctx.chatId || userId),
      state: 'naming_subtasks',
      data: { taskId, count, subtasks: [], currentIndex: 0 },
      updatedAt: new Date()
    });

    await ctx.answerOnCallback({
      message: {
        text: `✂️ *Декомпозиция на ${count} подзадачи*\n\n` +
              `Оригинальная задача: *${task.title}*\n\n` +
              `Отправь название для подзадачи 1/${count}:`,
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      }
    });
  } catch (error) {
    console.error('Error in handleTaskSplitCount:', error);
    await ctx.reply(messages.error);
  }
}

export async function handleSubtaskNameInput(ctx: Context, text: string): Promise<void> {
  try {
    const userId = ctx.message?.sender?.user_id;
    if (!userId) return;

    const maxUserId = String(userId);
    const user = await db.getUserByMaxId(maxUserId);
    if (!user) return;

    const botState = await db.getBotState(user.id);
    if (!botState || botState.state !== 'naming_subtasks') return;

    const { taskId, count, subtasks } = botState.data;
    subtasks.push(text.trim());

    if (subtasks.length < count) {
      // Запрашиваем следующую подзадачу
      await db.setBotState({
        userId: user.id,
        chatId: String(ctx.chatId || userId),
        state: 'naming_subtasks',
        data: { taskId, count, subtasks },
        updatedAt: new Date()
      });

      await ctx.reply(
        `✅ Подзадача ${subtasks.length} добавлена!\n\n` +
        `Отправь название для подзадачи ${subtasks.length + 1}/${count}:`
      );
    } else {
      // Все подзадачи получены - создаём их
      const originalTask = await taskService.getTask(taskId);
      if (!originalTask) {
        await ctx.reply('Ошибка: задача не найдена');
        await db.clearBotState(user.id);
        return;
      }

      const createdSubtasks = await taskService.createSubtasks(
        taskId,
        subtasks,
        originalTask.deadline
      );

      await db.clearBotState(user.id);

      let resultText = `✅ *Задача разбита!*\n\n`;
      resultText += `Оригинальная: ~~${originalTask.title}~~\n\n`;
      resultText += `Создано ${count} подзадач:\n`;
      createdSubtasks.forEach((st, i) => {
        resultText += `${i + 1}. ${st.title}\n`;
      });

      await ctx.reply(resultText, {
        attachments: [getBackToMenuKeyboard()],
        format: 'markdown'
      });
    }
  } catch (error) {
    console.error('Error in handleSubtaskNameInput:', error);
    await ctx.reply(messages.error);
  }
}

