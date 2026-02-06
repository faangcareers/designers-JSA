import { all, get, run } from "./db.js";
import { parseSourceUrl } from "./source-parser.js";

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

export async function refreshSource(source) {
  const ranAt = nowIso();
  try {
    if (isSpotifySource(source.url)) {
      await run(
        "DELETE FROM jobs WHERE source_id = ? AND (url IS NULL OR LOWER(url) NOT LIKE ?)",
        [source.id, "%lifeatspotify.com/jobs/%"]
      );
    }

    const parsed = await parseSourceUrl(source.url);
    const jobs = parsed.jobs || [];

    let newCount = 0;
    for (const job of jobs) {
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
          ranAt,
          ranAt,
        ]
      );

      const existing = await all(
        "SELECT id, first_seen_at FROM jobs WHERE source_id = ? AND job_key = ?",
        [source.id, jobKey]
      );

      if (existing.length) {
        await run(
          "UPDATE jobs SET last_seen_at = ? WHERE source_id = ? AND job_key = ?",
          [ranAt, source.id, jobKey]
        );
        if (existing[0].first_seen_at === ranAt) {
          newCount += 1;
        }
      }
    }

    await run(
      "UPDATE sources SET last_checked_at = ?, last_status = ?, last_error = NULL WHERE id = ?",
      [ranAt, "ok", source.id]
    );
    await run(
      "INSERT INTO job_runs (source_id, ran_at, new_count, total_count, status, error) VALUES (?, ?, ?, ?, ?, ?)",
      [source.id, ranAt, newCount, jobs.length, "ok", null]
    );

    return { newCount, totalCount: jobs.length };
  } catch (err) {
    await run(
      "UPDATE sources SET last_checked_at = ?, last_status = ?, last_error = ? WHERE id = ?",
      [ranAt, "error", err?.message || "Parse failed", source.id]
    );
    await run(
      "INSERT INTO job_runs (source_id, ran_at, new_count, total_count, status, error) VALUES (?, ?, ?, ?, ?, ?)",
      [source.id, ranAt, 0, 0, "error", err?.message || "Parse failed"]
    );
    throw err;
  }
}

export async function refreshAllSources() {
  const sources = await all("SELECT * FROM sources ORDER BY created_at DESC");
  const results = [];
  for (const source of sources) {
    try {
      const result = await refreshSource(source);
      results.push({ sourceId: source.id, ...result, status: "ok" });
    } catch (err) {
      results.push({
        sourceId: source.id,
        status: "error",
        error: err?.message || "Refresh failed",
      });
    }
  }
  return results;
}
