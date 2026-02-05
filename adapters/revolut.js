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

function buildJobUrl(origin, slug, id) {
  if (!slug && !id) return null;
  const slugPart = slug || id;
  return `${origin.replace(/\/$/, "")}/careers/${slugPart}`;
}

function isJobLikeObject(obj) {
  if (!obj || typeof obj !== "object") return false;
  const title = obj.title || obj.name || obj.positionTitle || obj.jobTitle || obj.role;
  const url = obj.url || obj.jobUrl || obj.applyUrl || obj.apply_url || obj.link || obj.permalink;
  const slug = obj.slug || obj.id || obj.requisitionId || obj.uuid;
  return Boolean(title && (url || slug));
}

function extractJob(obj, origin, context) {
  const title = obj.title || obj.name || obj.positionTitle || obj.jobTitle || obj.role;
  const urlRaw = obj.url || obj.jobUrl || obj.applyUrl || obj.apply_url || obj.link || obj.permalink;
  const slug = obj.slug || obj.id || obj.requisitionId || obj.uuid;
  const url = urlRaw ? absoluteUrl(origin, urlRaw) : buildJobUrl(origin, slug, obj.id);
  if (!title || !url) return null;

  const location =
    obj.location ||
    obj.location_display ||
    obj.city ||
    obj.place ||
    obj.country ||
    obj.locations?.[0]?.name ||
    obj.office?.name ||
    obj.office ||
    null;

  const tags = Array.isArray(obj.categories)
    ? obj.categories.map((c) => normalizeWhitespace(c.name || c)).filter(Boolean)
    : Array.isArray(obj.tags)
      ? obj.tags.map((t) => normalizeWhitespace(t.name || t)).filter(Boolean)
      : null;

  return {
    title: normalizeWhitespace(title),
    company: context.company || "Revolut",
    location: location ? normalizeWhitespace(location) : null,
    url,
    postedAt: obj.datePosted || obj.postedAt || obj.published_at || obj.created_at || null,
    tags: tags && tags.length ? tags : null,
  };
}

function collectJobsFromJson(data, origin, context) {
  const jobs = [];
  const seen = new Set();
  const queue = [data];

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;

    if (Array.isArray(node)) {
      node.forEach((item) => queue.push(item));
      continue;
    }

    if (typeof node === "object") {
      if (isJobLikeObject(node)) {
        const job = extractJob(node, origin, context);
        if (job) {
          const key = `${job.title}::${job.url}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            jobs.push(job);
          }
        }
      }
      Object.values(node).forEach((value) => queue.push(value));
    }
  }

  return jobs;
}

function getNextDataConfig($) {
  const script = $("script#__NEXT_DATA__").text().trim();
  if (!script) return null;
  try {
    return JSON.parse(script);
  } catch {
    return null;
  }
}

function getLocalePath(baseUrl, nextData) {
  try {
    const url = new URL(baseUrl);
    const pathname = url.pathname.replace(/\/$/, "");
    if (pathname.startsWith("/careers")) {
      const locale = nextData?.locale || nextData?.defaultLocale;
      if (locale && locale !== nextData?.defaultLocale) {
        return `${locale}/careers`;
      }
      if (locale && nextData?.defaultLocale) {
        return `${locale}/careers`;
      }
      return "careers";
    }

    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 2).join("/");
    }
  } catch {
    return "careers";
  }

  return "careers";
}

function findLocationFromText(text) {
  const cleaned = normalizeWhitespace(text);
  const remote = cleaned.match(/\b(Remote|Hybrid|On[- ]?site)\b/i);
  if (remote) return remote[0];
  const cityState = cleaned.match(/\b[A-Z][a-zA-Z]+,\s?[A-Z]{2}\b/);
  if (cityState) return cityState[0];
  const cityCountry = cleaned.match(/\b[A-Z][a-zA-Z]+,\s?[A-Z][a-zA-Z]+\b/);
  if (cityCountry) return cityCountry[0];
  return null;
}

function extractFromDom($, origin, context) {
  const jobs = [];
  const seen = new Set();

  $("a[href*='/careers/position/']").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const url = href ? absoluteUrl(origin, href) : null;
    if (!url) return;

    const block = $(anchor).closest("li, article, div, section").get(0) || anchor;
    const titleCandidates = [
      $(block).find("h1").first().text(),
      $(block).find("h2").first().text(),
      $(block).find("h3").first().text(),
      $(anchor).text(),
    ];
    const title = titleCandidates.map(normalizeWhitespace).find((t) => t);
    if (!title) return;

    const blockText = normalizeWhitespace($(block).text());
    const location = findLocationFromText(blockText);

    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    jobs.push({
      title,
      company: context.company || "Revolut",
      location: location || null,
      url,
      postedAt: null,
      tags: null,
    });
  });

  return jobs;
}

export async function parseRevolut($, baseUrl, context = {}) {
  const nextData = getNextDataConfig($);
  const buildId = nextData?.buildId;
  const origin = new URL(baseUrl).origin;

  if (buildId && context.fetchJson) {
    const localePath = getLocalePath(baseUrl, nextData);
    const search = new URL(baseUrl).search || "";
    const dataUrl = `${origin}/_next/data/${buildId}/${localePath}.json${search}`;
    try {
      const payload = await context.fetchJson(dataUrl, {
        headers: {
          Referer: baseUrl,
          Cookie: context.cookies || "",
        },
      });
      const jobs = collectJobsFromJson(payload, origin, context);
      if (jobs.length) return jobs;
    } catch {
      // fall back to DOM parsing
    }
  }

  const fromNextData = collectJobsFromJson(nextData, origin, context);
  if (fromNextData.length) return fromNextData;

  return extractFromDom($, origin, context);
}
