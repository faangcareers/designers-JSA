import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawStage = String(process.env.STAGE || "dev").trim().toLowerCase();
const STAGE =
  rawStage === "prod" || rawStage === "production" ? "production" : "dev";
const defaultDbName = STAGE === "production" ? "app.production.db" : "app.dev.db";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", defaultDbName);

mkdirSync(path.dirname(DB_PATH), { recursive: true });

let dbInstance;

async function getDb() {
  if (dbInstance) return dbInstance;
  const SQL = await initSqlJs();
  let db;
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      last_checked_at TEXT,
      last_status TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      job_key TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      url TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 1,
      UNIQUE(source_id, job_key)
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      ran_at TEXT NOT NULL,
      new_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_is_new ON jobs(is_new);
  `);

  dbInstance = db;
  persist();
  return dbInstance;
}

function persist() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

async function run(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  persist();
}

async function get(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row && Object.keys(row).length ? row : null;
}

async function all(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export { DB_PATH, run, get, all };
