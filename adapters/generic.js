const JOB_KEYWORDS = /\b(design|designer|ux|ui|product design|visual|graphic|interaction|content design|researcher|creative)\b/i;
const LOCATION_KEYWORDS = /\b(Remote|Hybrid|On[- ]?site)\b/i;
const POSTED_KEYWORDS = /\b(Posted|Requisition|Req\.?|Updated|Day[s]? ago|Week[s]? ago)\b/i;

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function isLikelyJobAnchor($, anchor) {
  const text = normalizeWhitespace($(anchor).text());
  const href = $(anchor).attr("href") || "";
  if (!text || text.length < 4) return false;
  if (JOB_KEYWORDS.test(text)) return true;
  if (JOB_KEYWORDS.test(href)) return true;
  return false;
}

function absoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function findLocation(text) {
  const cleaned = normalizeWhitespace(text);
  const remote = cleaned.match(LOCATION_KEYWORDS);
  if (remote) return remote[0];

  const usCityState = cleaned.match(/\b[A-Z][a-zA-Z]+,\s?[A-Z]{2}\b/);
  if (usCityState) return usCityState[0];

  const cityCountry = cleaned.match(/\b[A-Z][a-zA-Z]+,\s?[A-Z][a-zA-Z]+\b/);
  if (cityCountry) return cityCountry[0];

  const locationLine = cleaned.match(/Location:\s*([^|]+)/i);
  if (locationLine) return locationLine[1].trim();

  return null;
}

function findPostedAt(text) {
  const cleaned = normalizeWhitespace(text);
  const relative = cleaned.match(/\b(\d+\s?(day|week|month)s?\s?ago)\b/i);
  if (relative) return relative[1];

  const date = cleaned.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]{2,8}\s\d{1,2},\s\d{4})\b/);
  if (date) return date[1];

  const posted = cleaned.match(/Posted\s*:?\s*([^|]+)/i);
  if (posted) return posted[1].trim();

  return null;
}

function extractTitle($, block) {
  const candidates = [
    $(block).find("h1").first().text(),
    $(block).find("h2").first().text(),
    $(block).find("h3").first().text(),
    $(block).find("a").first().text(),
  ];

  const title = candidates.map(normalizeWhitespace).find((t) => t);
  return title || null;
}

function extractTags(text) {
  const tags = [];
  const lower = text.toLowerCase();
  if (lower.includes("ux")) tags.push("UX");
  if (lower.includes("ui")) tags.push("UI");
  if (lower.includes("product")) tags.push("Product");
  if (lower.includes("research")) tags.push("Research");
  if (lower.includes("visual")) tags.push("Visual");
  if (lower.includes("graphic")) tags.push("Graphic");
  return Array.from(new Set(tags));
}

function scoreBlock($, block) {
  const text = normalizeWhitespace($(block).text());
  let score = 0;
  if (JOB_KEYWORDS.test(text)) score += 2;
  if ($(block).find("a").length > 0) score += 1;
  if ($(block).find("h1,h2,h3").length > 0) score += 1;
  return score;
}

function isJobLikeObject(obj) {
  if (!obj || typeof obj !== "object") return false;
  const title = obj.title || obj.name || obj.position || obj.jobTitle;
  const url = obj.url || obj.applyUrl || obj.apply_url || obj.link;
  return Boolean(title && url);
}

function toJob(obj, baseUrl, context) {
  const title = obj.title || obj.name || obj.position || obj.jobTitle;
  const urlRaw = obj.url || obj.applyUrl || obj.apply_url || obj.link;
  const url = absoluteUrl(baseUrl, urlRaw) || urlRaw;
  const locationRaw =
    obj.location ||
    obj.jobLocation ||
    obj.address ||
    obj.city ||
    obj.place ||
    obj.locationName;
  const location =
    typeof locationRaw === "string"
      ? locationRaw
      : locationRaw?.addressLocality || locationRaw?.name || null;
  const postedAt =
    obj.datePosted ||
    obj.postedAt ||
    obj.publishedAt ||
    obj.createdAt ||
    null;

  const tags = extractTags(
    [title, obj.department, obj.team, obj.category].filter(Boolean).join(" ")
  );

  if (!title || !url) return null;
  return {
    title: normalizeWhitespace(title),
    company: context.company || null,
    location: location ? normalizeWhitespace(String(location)) : null,
    url,
    postedAt: postedAt ? normalizeWhitespace(String(postedAt)) : null,
    tags: tags.length ? tags : null,
  };
}

function collectJobsFromJson(json, baseUrl, context) {
  const jobs = [];
  const queue = [json];
  const seen = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;

    if (Array.isArray(node)) {
      node.forEach((item) => queue.push(item));
      continue;
    }

    if (typeof node === "object") {
      if (isJobLikeObject(node)) {
        const job = toJob(node, baseUrl, context);
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

function parseJsonLd($, baseUrl, context) {
  const jobs = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    try {
      const data = JSON.parse(text);
      const dataArray = Array.isArray(data) ? data : [data];
      dataArray.forEach((item) => {
        if (item?.["@type"] === "JobPosting" || item?.["@type"] === "Job") {
          const job = toJob(item, baseUrl, context);
          if (job) jobs.push(job);
        }
        if (Array.isArray(item?.itemListElement)) {
          const nested = collectJobsFromJson(item.itemListElement, baseUrl, context);
          jobs.push(...nested);
        }
      });
    } catch {
      return;
    }
  });
  return jobs;
}

function parseEmbeddedJson($, baseUrl, context) {
  const jobs = [];
  const candidates = [];

  const nextData = $("#__NEXT_DATA__").text().trim();
  if (nextData) candidates.push(nextData);

  const nuxtData = $("#__NUXT__").text().trim();
  if (nuxtData && nuxtData.startsWith("{")) candidates.push(nuxtData);

  $("script[type='application/json']").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.startsWith("{")) candidates.push(text);
  });

  for (const jsonText of candidates.slice(0, 5)) {
    try {
      const data = JSON.parse(jsonText);
      const extracted = collectJobsFromJson(data, baseUrl, context);
      jobs.push(...extracted);
    } catch {
      continue;
    }
  }

  return jobs;
}

export function parseGeneric($, baseUrl, context = {}) {
  const jobs = [];
  const seen = new Set();

  const structuredJobs = parseJsonLd($, baseUrl, context);
  for (const job of structuredJobs) {
    const key = `${job.title}::${job.url}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      jobs.push(job);
    }
  }

  const embeddedJobs = parseEmbeddedJson($, baseUrl, context);
  for (const job of embeddedJobs) {
    const key = `${job.title}::${job.url}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      jobs.push(job);
    }
  }

  const anchors = $("a").toArray().filter((a) => isLikelyJobAnchor($, a));

  for (const anchor of anchors) {
    const block = $(anchor).closest("li, article, div, tr, section").get(0) || anchor;
    const blockScore = scoreBlock($, block);
    if (blockScore < 2) continue;

    const title = extractTitle($, block) || normalizeWhitespace($(anchor).text());
    if (!title) continue;

    const href = $(anchor).attr("href");
    const url = href ? absoluteUrl(baseUrl, href) : null;
    if (!url) continue;

    const blockText = normalizeWhitespace($(block).text());
    const location = findLocation(blockText);
    const postedAt = findPostedAt(blockText);
    const tags = extractTags(blockText);

    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    jobs.push({
      title,
      company: context.company || null,
      location: location || null,
      url,
      postedAt: postedAt || null,
      tags: tags.length ? tags : null,
    });
  }

  return jobs;
}
