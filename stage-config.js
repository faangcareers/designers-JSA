import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const rawStage = String(process.env.STAGE || "dev").trim().toLowerCase();
export const STAGE =
  rawStage === "prod" || rawStage === "production" ? "production" : "dev";

export const IS_PRODUCTION = STAGE === "production";
export const PORT = toInt(process.env.PORT, 3000);
export const HOST = process.env.HOST || "127.0.0.1";
export const CRON_HOUR = Math.min(23, Math.max(0, toInt(process.env.CRON_HOUR, 9)));
export const CRON_TZ = process.env.CRON_TZ || "";
export const ENABLE_INTERNAL_CRON = toBool(process.env.ENABLE_INTERNAL_CRON, true);

const defaultDbName = IS_PRODUCTION ? "app.production.db" : "app.dev.db";
export const DEFAULT_DB_PATH = path.join(__dirname, "data", defaultDbName);
export const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

