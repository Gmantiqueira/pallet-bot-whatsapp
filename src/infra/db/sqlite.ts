import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (db !== null) {
    return db;
  }

  const dbPath = process.env.DB_PATH || './data/app.db';
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
};

export const closeDb = (): void => {
  if (db !== null) {
    db.close();
    db = null;
  }
};
