import PostgresDatabase from './postgres';

export const db = new PostgresDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.initialize();
  console.log('✅ PostgreSQL connected');
}
