import "dotenv/config";
import http from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import { parseSourceUrl } from "./source-parser.js";
import { all, get, run } from "./db.js";
import { refreshAllSources, refreshSource } from "./refresh.js";
import {
  PORT,
  HOST,
  STAGE,
  CRON_HOUR,
  CRON_TZ,
  ENABLE_INTERNAL_CRON,
  DB_PATH,
} from "./stage-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

function nowIso() {
  return new Date().toISOString();
}

function makeJobKey(job) {
  const url = job.url ? job.url.split("#")[0].split("?")[0] : "";
  const title = job.title || "";
  const company = job.company || "";
  const location = job.location || "";
  return `${url}::${title}::${company}::${location}`.toLowerCase();
}

function isSpotifySource(url) {
  try {
    return new URL(url).hostname.toLowerCase().includes("lifeatspotify.com");
  } catch {
    return false;
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  let pathname = requestUrl.pathname || "/";
  if (pathname === "/") pathname = "/index.html";
  const safePath = pathname.replace(/^\/+/, "");

  const filePath = path.join(PUBLIC_DIR, path.normalize(safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

let refreshInFlight = false;

async function handleParse(req, res) {
  try {
    const data = await readJson(req);
    const url = data?.url?.trim();
    if (!url) return json(res, 400, { error: "Missing url" });
    const parsed = await parseSourceUrl(url);
    return json(res, 200, parsed);
  } catch (err) {
    return json(res, 400, { error: err.message || "Parse failed" });
  }
}

async function handleAddSource(req, res) {
  try {
    const data = await readJson(req);
    const url = data?.url?.trim();
    if (!url) return json(res, 400, { error: "Missing url" });

    const createdAt = nowIso();
    await run(
      "INSERT OR IGNORE INTO sources (url, created_at, last_status) VALUES (?, ?, ?)",
      [url, createdAt, "pending"]
    );
    const source = await get("SELECT * FROM sources WHERE url = ?", [url]);

    if (isSpotifySource(source.url)) {
      await run(
        "DELETE FROM jobs WHERE source_id = ? AND (url IS NULL OR LOWER(url) NOT LIKE ?)",
        [source.id, "%lifeatspotify.com/jobs/%"]
      );
    }

    const parsed = await parseSourceUrl(url);
    let newCount = 0;

    for (const job of parsed.jobs) {
      const jobKey = makeJobKey(job);
      const excluded = await get(
        "SELECT id FROM job_exclusions WHERE source_id = ? AND job_key = ?",
        [source.id, jobKey]
      );
      if (excluded) {
        continue;
      }

      await run(
        `INSERT OR IGNORE INTO jobs
         (source_id, job_key, title, company, location, url, first_seen_at, last_seen_at, is_new)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          source.id,
          jobKey,
          job.title || "Untitled",
          job.company || null,
          job.location || null,
          job.url,
          createdAt,
          createdAt,
        ]
      );
      const existing = await all(
        "SELECT id, first_seen_at FROM jobs WHERE source_id = ? AND job_key = ?",
        [source.id, jobKey]
      );
      if (existing.length && existing[0].first_seen_at === createdAt) {
        newCount += 1;
      } else {
        await run(
          "UPDATE jobs SET last_seen_at = ? WHERE source_id = ? AND job_key = ?",
          [createdAt, source.id, jobKey]
        );
      }
    }

    await run(
      "UPDATE sources SET last_checked_at = ?, last_status = ?, last_error = NULL WHERE id = ?",
      [createdAt, "ok", source.id]
    );
    await run(
      "INSERT INTO job_runs (source_id, ran_at, new_count, total_count, status, error) VALUES (?, ?, ?, ?, ?, ?)",
      [source.id, createdAt, newCount, parsed.jobs.length, "ok", null]
    );

    return json(res, 200, {
      source,
      newCount,
      totalCount: parsed.jobs.length,
      warnings: parsed.warnings,
    });
  } catch (err) {
    return json(res, 400, { error: err.message || "Failed to add source" });
  }
}

async function handleRefreshAll(req, res) {
  if (refreshInFlight) {
    return json(res, 409, { error: "Refresh already running" });
  }
  refreshInFlight = true;
  try {
    const results = await refreshAllSources();
    return json(res, 200, { results });
  } catch (err) {
    return json(res, 500, { error: err.message || "Refresh failed" });
  } finally {
    refreshInFlight = false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return json(res, 200, {
      ok: true,
      stage: STAGE,
      dbPath: DB_PATH,
      internalCron: ENABLE_INTERNAL_CRON,
      cronHour: CRON_HOUR,
      cronTz: CRON_TZ || "local",
      now: nowIso(),
    });
  }

  if (req.method === "POST" && req.url === "/api/parse") {
    return handleParse(req, res);
  }

  if (req.method === "POST" && req.url === "/api/sources") {
    return handleAddSource(req, res);
  }

  if (req.method === "GET" && req.url === "/api/sources") {
    const sources = await all(
      `SELECT s.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.source_id = s.id AND j.is_new = 1) AS new_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.source_id = s.id) AS total_count
       FROM sources s
       ORDER BY s.created_at DESC`
    );
    return json(res, 200, { sources });
  }

  if (req.method === "POST" && req.url === "/api/refresh") {
    return handleRefreshAll(req, res);
  }

  if (req.method === "GET" && req.url?.startsWith("/api/jobs")) {
    const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    const sourceId = requestUrl.searchParams.get("sourceId");
    if (sourceId) {
      const jobs = await all(
        "SELECT * FROM jobs WHERE source_id = ? ORDER BY is_new DESC, first_seen_at DESC",
        [Number(sourceId)]
      );
      return json(res, 200, { jobs });
    }
    const jobs = await all(
      `SELECT j.*, s.url as source_url
       FROM jobs j
       JOIN sources s ON s.id = j.source_id
       ORDER BY j.is_new DESC, j.first_seen_at DESC`
    );
    return json(res, 200, { jobs });
  }

  if (req.method === "POST" && req.url?.startsWith("/api/sources/") && req.url.endsWith("/mark-seen")) {
    const id = Number(req.url.split("/")[3]);
    if (!Number.isFinite(id)) {
      return json(res, 400, { error: "Invalid source id" });
    }
    await run("UPDATE jobs SET is_new = 0 WHERE source_id = ?", [id]);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url?.startsWith("/api/sources/") && req.url.endsWith("/refresh")) {
    const id = Number(req.url.split("/")[3]);
    if (!Number.isFinite(id)) {
      return json(res, 400, { error: "Invalid source id" });
    }
    const source = await get("SELECT * FROM sources WHERE id = ?", [id]);
    if (!source) {
      return json(res, 404, { error: "Source not found" });
    }
    try {
      const result = await refreshSource(source);
      return json(res, 200, { ok: true, result });
    } catch (err) {
      return json(res, 500, { error: err?.message || "Refresh failed" });
    }
  }

  if (req.method === "DELETE" && req.url?.startsWith("/api/jobs/")) {
    const id = Number(req.url.split("/")[3]);
    if (!Number.isFinite(id)) {
      return json(res, 400, { error: "Invalid job id" });
    }
    const job = await get("SELECT id, source_id, job_key, url FROM jobs WHERE id = ?", [id]);
    if (!job) {
      return json(res, 404, { error: "Job not found" });
    }
    const createdAt = nowIso();
    await run(
      `INSERT OR IGNORE INTO job_exclusions
       (source_id, job_key, job_url, created_at)
       VALUES (?, ?, ?, ?)`,
      [job.source_id, job.job_key, job.url, createdAt]
    );
    await run("DELETE FROM jobs WHERE id = ?", [id]);
    return json(res, 200, { ok: true });
  }

  if (req.method === "DELETE" && req.url?.startsWith("/api/sources/")) {
    const id = Number(req.url.split("/")[3]);
    if (!Number.isFinite(id)) {
      return json(res, 400, { error: "Invalid source id" });
    }
    await run("DELETE FROM jobs WHERE source_id = ?", [id]);
    await run("DELETE FROM job_runs WHERE source_id = ?", [id]);
    await run("DELETE FROM job_exclusions WHERE source_id = ?", [id]);
    await run("DELETE FROM sources WHERE id = ?", [id]);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (stage=${STAGE})`);
});

if (ENABLE_INTERNAL_CRON) {
  const cronOptions = CRON_TZ ? { timezone: CRON_TZ } : undefined;
  cron.schedule(`0 ${CRON_HOUR} * * *`, async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      await refreshAllSources();
    } catch (err) {
      console.error("Scheduled refresh failed", err);
    } finally {
      refreshInFlight = false;
    }
  }, cronOptions);
}
