/**
 * Клавиатуры для бота
 */

import { Keyboard } from '@maxhub/max-bot-api';

/**
 * Главное меню
 */
export function getMainMenuKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('➕ Задача', 'action:add_task'),
      Keyboard.button.callback('📋 Задачи', 'action:my_tasks')
    ],
    [
      Keyboard.button.callback('⏱️ Фокус', 'action:focus_duration'),
      Keyboard.button.callback('🎯 Pod', 'action:create_pod')
    ],
    [
      Keyboard.button.callback('🔑 Код Pod', 'action:join_by_code'),
      Keyboard.button.callback('👤 Профиль', 'action:profile')
    ],
    [Keyboard.button.callback('❓ Помощь', 'action:help')]
  ]);
}

/**
 * Клавиатура выбора длительности Pod
 */
export function getPodDurationKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('⚡ 25 мин', 'pod_duration:25'),
      Keyboard.button.callback('🔥 50 мин', 'pod_duration:50')
    ],
    [
      Keyboard.button.callback('💪 90 мин', 'pod_duration:90'),
      Keyboard.button.callback('🚀 120 мин', 'pod_duration:120')
    ],
    [Keyboard.button.callback('⬅️ Назад', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура выбора длительности Pomodoro
 */
export function getFocusDurationKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('⚡ 1 мин (тест)', 'focus_duration:1'),
      Keyboard.button.callback('🔥 2 мин (тест)', 'focus_duration:2')
    ],
    [
      Keyboard.button.callback('💪 25 мин', 'focus_duration:25'),
      Keyboard.button.callback('🚀 50 мин', 'focus_duration:50')
    ],
    [Keyboard.button.callback('⬅️ Назад', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура Pomodoro сессии
 */
export function getPomodoroKeyboard(sessionId: string) {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('⏱️ Статус', `session_status:${sessionId}`),
      Keyboard.button.callback('✅ Завершить', `session_complete:${sessionId}:completed`)
    ],
    [Keyboard.button.callback('❌ Отменить', `session_cancel:${sessionId}`)],
    [Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура после завершения Pomodoro
 */
export function getPomodoroCompleteKeyboard(sessionId: string) {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('✅ Выполнил', `session_complete:${sessionId}:completed`),
      Keyboard.button.callback('✂️ Распилил', `session_complete:${sessionId}:split`)
    ],
    [
      Keyboard.button.callback('⏸️ Отложил', `session_complete:${sessionId}:postponed`),
      Keyboard.button.callback('⏭️ Пропустил', `session_complete:${sessionId}:skipped`)
    ]
  ]);
}

/**
 * Клавиатура управления Pod
 */
export function getPodControlKeyboard(podId: string, isCreator: boolean) {
  const buttons = [];

  if (isCreator) {
    buttons.push([
      Keyboard.button.callback('▶️ Начать', `pod_start:${podId}`),
      Keyboard.button.callback('❌ Отменить', `pod_cancel:${podId}`)
    ]);
  }

  buttons.push([
    Keyboard.button.callback('🔄 Обновить', `pod_info:${podId}`),
    Keyboard.button.callback('📤 Поделиться', `pod_share:${podId}`)
  ]);

  buttons.push([Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]);

  return Keyboard.inlineKeyboard(buttons);
}

/**
 * Клавиатура активного Pod
 */
export function getActivePodKeyboard(podId: string) {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('📊 Статистика', `pod_stats:${podId}`)],
    [Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура выбора действия после задачи
 */
export function getTaskActionKeyboard(taskId: string) {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('✅ Выполнить', `task_action:${taskId}:complete`),
      Keyboard.button.callback('✂️ Распилить', `task_action:${taskId}:split`)
    ],
    [
      Keyboard.button.callback('⏸️ Отложить', `task_action:${taskId}:postpone`),
      Keyboard.button.callback('🗑️ Удалить', `task_action:${taskId}:delete`)
    ],
    [Keyboard.button.callback('⬅️ Назад', 'action:my_tasks')]
  ]);
}

/**
 * Клавиатура списка задач с названиями на кнопках
 */
export function getTaskListKeyboard(tasks: any[], currentPage: number = 0, totalPages: number = 1) {
  const buttons: any[] = [];

  // Кнопки для каждой задачи (максимум 5 на страницу)
  const TASKS_PER_PAGE = 5;
  const startIdx = currentPage * TASKS_PER_PAGE;
  const endIdx = Math.min(startIdx + TASKS_PER_PAGE, tasks.length);
  const pageTasks = tasks.slice(startIdx, endIdx);
  
  pageTasks.forEach(task => {
    // Обрезаем длинные названия до 35 символов (лимит MAX кнопок)
    let taskName = task.title.length > 35
      ? task.title.substring(0, 32) + '...'
      : task.title;
    
    // Добавляем эмодзи в зависимости от статуса
    const emoji = task.completed ? '✅' : (task.deadline ? '⏰' : '📌');
    const prefix = task.parentTaskId ? '↳ ' : '';
    
    buttons.push([
      Keyboard.button.callback(
        `${emoji} ${prefix}${taskName}`,
        `task_view:${task.id}`
      )
    ]);
  });

  // Пагинация
  if (totalPages > 1) {
    const paginationRow = [];
    if (currentPage > 0) {
      paginationRow.push(Keyboard.button.callback('◀️ Назад', `task_page:${currentPage - 1}`));
    }
    paginationRow.push(Keyboard.button.callback(`📄 ${currentPage + 1}/${totalPages}`, `task_page:${currentPage}`));
    if (currentPage < totalPages - 1) {
      paginationRow.push(Keyboard.button.callback('Вперёд ▶️', `task_page:${currentPage + 1}`));
    }
    buttons.push(paginationRow);
  }

  buttons.push([
    Keyboard.button.callback('➕ Задача', 'action:add_task'),
    Keyboard.button.callback('⬅️ Меню', 'action:back_to_menu')
  ]);

  return Keyboard.inlineKeyboard(buttons);
}

/**
 * Клавиатура профиля
 */
export function getProfileKeyboard() {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('🏆 Достижения', 'action:achievements'),
      Keyboard.button.callback('📊 Статистика', 'action:stats')
    ],
    [Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура достижений
 */
export function getAchievementsKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('⬅️ Назад', 'action:profile')]
  ]);
}

/**
 * Простая кнопка "Назад в меню"
 */
export function getBackToMenuKeyboard() {
  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]
  ]);
}

/**
 * Клавиатура подтверждения
 */
export function getConfirmKeyboard(action: string, data: string) {
  return Keyboard.inlineKeyboard([
    [
      Keyboard.button.callback('✅ Да', `confirm:${action}:${data}:yes`),
      Keyboard.button.callback('❌ Нет', `confirm:${action}:${data}:no`)
    ]
  ]);
}

/**
 * Клавиатура Pod с кнопкой приглашения
 * MAX deep links (max://max.ru/{bot}?start=pod_{code}) работают только внутри MAX
 */
export function getPodQRKeyboard(podId: string, shareLink: string) {
  const buttons: any[] = [
    [Keyboard.button.callback('▶️ Начать сейчас', `pod_start:${podId}`)],
    [Keyboard.button.callback('📋 Показать код', `pod_show_code:${podId}`)]
  ];
  
  // MAX deep links поддерживаются, но показываем кнопку с кодом как основной способ
  // В продакшене пользователь может отправить ссылку через "Поделиться"
  
  buttons.push([Keyboard.button.callback('⬅️ В меню', 'action:back_to_menu')]);
  
  return Keyboard.inlineKeyboard(buttons);
}

