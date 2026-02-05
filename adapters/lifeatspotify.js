const JOB_PATH_REGEX = /\/jobs\/[a-z0-9-]+/i;
const EXCLUDED_PATHS = [/\/jobs\/?$/i, /\/jobs\?/i, /\/jobs#?/i];

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function looksLikeJobUrl(url) {
  if (!url) return false;
  if (EXCLUDED_PATHS.some((rx) => rx.test(url))) return false;
  return JOB_PATH_REGEX.test(url);
}

function extractTitle($, anchor) {
  const block = $(anchor).closest("li, article, div, section").get(0) || anchor;
  const candidates = [
    $(block).find("h1").first().text(),
    $(block).find("h2").first().text(),
    $(block).find("h3").first().text(),
    $(anchor).text(),
  ];

  const title = candidates.map(normalizeWhitespace).find((t) => t);
  return title || null;
}

function getCategoryFromUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("job-categories");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    return null;
  }
  return null;
}

function findArray(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return null;
}

function extractJobsFromPayload(payload, baseUrl, context) {
  const items = findArray(payload) || [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title =
        item.text ||
        item.position_title ||
        item.title ||
        item.job_title ||
        item.name ||
        item.role;
      const url =
        item.job_url ||
        item.url ||
        item.link ||
        item.apply_url ||
        (item.slug ? `https://www.lifeatspotify.com/jobs/${item.slug}` : null) ||
        (item.id ? `https://www.lifeatspotify.com/jobs/${item.id}` : null);
      if (!title || !url) return null;

      const location =
        item.location ||
        item.city ||
        item.place ||
        item.location_display ||
        item.locations?.[0]?.name ||
        item.locations?.[0]?.location ||
        null;
      const tags = Array.isArray(item.categories)
        ? item.categories.map((c) => normalizeWhitespace(c.name || c)).filter(Boolean)
        : Array.isArray(item.tags)
          ? item.tags.map((t) => normalizeWhitespace(t.name || t)).filter(Boolean)
          : item.main_category?.name
            ? [normalizeWhitespace(item.main_category.name)]
            : null;

      return {
        title: normalizeWhitespace(title),
        company: context.company || "Spotify",
        location: location ? normalizeWhitespace(location) : null,
        url,
        postedAt: item.date_posted || item.published_at || null,
        tags: tags && tags.length ? tags : null,
      };
    })
    .filter(Boolean);
}

async function fetchJobsFromApi(baseUrl, context) {
  if (!context.fetchJson) return [];
  const category = getCategoryFromUrl(baseUrl) || "design";
  const apiUrl = `https://api.lifeatspotify.com/wp-json/animal/v1/job/search?c=${encodeURIComponent(
    category
  )}`;
  const payload = await context.fetchJson(apiUrl);
  return extractJobsFromPayload(payload, baseUrl, context);
}

export async function parseLifeAtSpotify($, baseUrl, context = {}) {
  const jobs = [];
  const seen = new Set();

  try {
    const apiJobs = await fetchJobsFromApi(baseUrl, context);
    for (const job of apiJobs) {
      const key = `${job.title}::${job.url}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
    }
  } catch {
    // fall back to DOM anchors
  }

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const url = href ? absoluteUrl(baseUrl, href) : null;
    if (!looksLikeJobUrl(url)) return;

    const title = extractTitle($, anchor);
    if (!title) return;

    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    jobs.push({
      title,
      company: context.company || "Spotify",
      location: null,
      url,
      postedAt: null,
      tags: null,
    });
  });

  return jobs;
}
