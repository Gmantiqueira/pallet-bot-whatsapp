import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

let db: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (db !== null) {
    return db;
  }

  const dbPath = process.env.DB_PATH || './data/app.db';

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  return db;
};

export const migrate = (): void => {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      phone TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      answers TEXT NOT NULL,
      stack TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN editStopBefore TEXT`);
  } catch {
    /* coluna já existe */
  }
};

export const closeDb = (): void => {
  if (db !== null) {
    db.close();
    db = null;
  }
};
