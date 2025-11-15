# Multi-stage build для оптимизации размера образа
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm ci --only=development

# Копируем исходный код
COPY src ./src

# Компилируем TypeScript
RUN npm run build

# Production образ
FROM node:20-alpine

WORKDIR /app

# Копируем только необходимые файлы
COPY package*.json ./
RUN npm ci --only=production

# Копируем скомпилированный код из builder
COPY --from=builder /app/dist ./dist

# Создаем пользователя без root прав
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Переключаемся на непривилегированного пользователя
USER nodejs

# Открываем порт для API
EXPOSE 3000

# Healthcheck для мониторинга
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode !== 200) throw new Error()})"

# Запуск приложения
CMD ["node", "dist/index.js"]

