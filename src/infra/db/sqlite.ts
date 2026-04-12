import * as fs from 'fs';
import * as path from 'path';

/**
 * Superfície mínima partilhada por `better-sqlite3` e `node:sqlite` (`DatabaseSync`).
 * Em ambientes como Vercel, `better-sqlite3` pode falhar a compilar (addon nativo);
 * nesse caso usamos o SQLite incorporado do Node 22+ (`node:sqlite`), sem prebuild.
 */
export type SyncSqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
  };
  close(): void;
};

let db: SyncSqliteDatabase | null = null;

function createDatabase(dbPath: string): SyncSqliteDatabase {
  try {
    const BetterSqlite3 = require('better-sqlite3') as new (
      path: string
    ) => SyncSqliteDatabase;
    return new BetterSqlite3(dbPath);
  } catch {
    try {
      const { DatabaseSync } =
        require('node:sqlite') as typeof import('node:sqlite');
      return new DatabaseSync(dbPath) as SyncSqliteDatabase;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `SQLite indisponível: instale better-sqlite3 (ex.: dev local) ou use Node.js 22+ com node:sqlite (ex.: Vercel). ${msg}`
      );
    }
  }
}

export const getDb = (): SyncSqliteDatabase => {
  if (db !== null) {
    return db;
  }

  const dbPath = process.env.DB_PATH || './data/app.db';

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = createDatabase(dbPath);
  db.exec('PRAGMA foreign_keys = ON');

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
