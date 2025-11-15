/**
 * Точка входа приложения MAX Focus Pods
 */

import * as dotenv from 'dotenv';
import { createBot, startBot } from './bot';
import { startApiServer } from './api/server';
import { initializeDatabase } from './storage';

dotenv.config();

// Проверяем обязательные переменные
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не указан в .env файле');
  console.error('Получите токен у @MasterBot в MAX');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

async function main() {
  console.log('🚀 Запуск MAX Focus Pods...');
  
  await initializeDatabase();
  
  if (BOT_TOKEN) {
    const bot = createBot(BOT_TOKEN);
    startBot(bot);
  }
  
  startApiServer(PORT);
  
  console.log('\n✅ MAX Focus Pods запущен успешно!');
  console.log('📱 Откройте бота в MAX и отправьте /start\n');
}

main().catch(err => {
  console.error('❌ Ошибка запуска:', err);
  process.exit(1);
});

// Обработка завершения
process.on('SIGINT', () => {
  console.log('\n⏹️  Остановка приложения...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Остановка приложения...');
  process.exit(0);
});


