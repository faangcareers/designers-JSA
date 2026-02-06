import { lookup } from "node:dns/promises";
import { URL } from "node:url";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_BYTES = 1.5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY || "";
const SCRAPINGBEE_API_URL = process.env.SCRAPINGBEE_API_URL || "https://app.scrapingbee.com/api/v1/";
const SCRAPINGBEE_RENDER_JS = process.env.SCRAPINGBEE_RENDER_JS === "true";
const SCRAPINGBEE_ALWAYS = process.env.SCRAPINGBEE_ALWAYS === "true";

const ZYTE_API_KEY = process.env.ZYTE_API_KEY || "";
const ZYTE_API_URL = process.env.ZYTE_API_URL || "https://api.zyte.com/v1/extract";
const ZYTE_BROWSER_HTML = process.env.ZYTE_BROWSER_HTML !== "false";
const ZYTE_STRUCTURED_DATA = process.env.ZYTE_STRUCTURED_DATA !== "false";
const ZYTE_EXTRACT_TYPE = process.env.ZYTE_EXTRACT_TYPE || "jobPosting";
const ZYTE_ALWAYS = process.env.ZYTE_ALWAYS === "true";
const ZYTE_DEBUG = process.env.ZYTE_DEBUG === "true";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStreamWithLimit(stream, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > limitBytes) {
      throw new Error("Response too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  return false;
}

function isBlockedHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") return true;
  if (lower.endsWith(".local")) return true;
  return false;
}

export async function ensurePublicAddress(hostname) {
  if (isBlockedHost(hostname)) {
    throw new Error("Blocked hostname (localhost or .local)");
  }

  const results = await lookup(hostname, { all: true, verbatim: true });
  for (const entry of results) {
    if (entry.family === 4 && isPrivateIPv4(entry.address)) {
      throw new Error("Blocked private IPv4 address");
    }
    if (entry.family === 6 && isPrivateIPv6(entry.address)) {
      throw new Error("Blocked private IPv6 address");
    }
  }
}

export function getCompanyFromMeta($, hostname) {
  const candidates = [
    $("meta[property='og:site_name']").attr("content"),
    $("meta[name='application-name']").attr("content"),
    $("meta[name='apple-mobile-web-app-title']").attr("content"),
    $("meta[name='twitter:site']").attr("content"),
  ];

  const name = candidates.find((value) => value && value.trim());
  return name ? name.trim().replace(/^@/, "") : hostname;
}

export function collectWarnings(html, $) {
  const warnings = [];
  const linkCount = $("a").length;
  const textLength = $("body").text().trim().length;

  if (linkCount < 5 || textLength < 200) {
    warnings.push(
      "This site may require JavaScript rendering; try another URL or use a different source."
    );
  }

  if (html.length > MAX_BYTES * 0.9) {
    warnings.push("Large page detected; some listings may be missed.");
  }

  return warnings;
}

export function mergeJobs(primary, secondary) {
  const seen = new Set();
  const merged = [];

  const add = (job) => {
    const key = `${job.title || ""}::${job.url || ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(job);
  };

  primary.forEach(add);
  secondary.forEach(add);

  return merged;
}

function extractZyteJobs(structuredData, fallbackCompany) {
  if (!structuredData) return [];

  let normalized = structuredData;
  if (typeof normalized === "string") {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = structuredData;
    }
  }

  const jobs = [];
  const seen = new Set();
  const queue = Array.isArray(normalized) ? [...normalized] : [normalized];

  const pushJob = (job) => {
    const title = job.title || job.name || job.jobTitle;
    const url = job.url || job.applyUrl || job.link;
    if (!title || !url) return;
    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const location =
      job.location ||
      job.jobLocation?.raw ||
      job.jobLocation ||
      job.location_display ||
      job.locationName ||
      job.location?.address?.addressLocality ||
      job.jobLocation?.address?.addressLocality ||
      null;

    const company =
      job.hiringOrganization?.name ||
      job.company?.name ||
      job.company ||
      fallbackCompany ||
      null;

    jobs.push({
      title: String(title).trim(),
      company: company ? String(company).trim() : null,
      location: location ? String(location).trim() : null,
      url,
      postedAt: job.datePosted || job.postedAt || null,
      tags: null,
    });
  };

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      node.forEach((item) => queue.push(item));
      continue;
    }
    if (typeof node === "object") {
      if (node.jobPosting || node.job_posting) {
        queue.push(node.jobPosting || node.job_posting);
      }
      if (node.jobPostingNavigation || node.job_posting_navigation) {
        queue.push(node.jobPostingNavigation || node.job_posting_navigation);
      }
      if (node.name === "jobPosting" && node.content) {
        queue.push(node.content);
      }
      if (Array.isArray(node.items)) {
        queue.push(...node.items);
      }
      if (Array.isArray(node.positions)) {
        queue.push(...node.positions);
      }
      if (Array.isArray(node.jobs)) {
        queue.push(...node.jobs);
      }
      if (node.type === "JobPosting" || node["@type"] === "JobPosting") {
        pushJob(node);
      } else if (node.title || node.name || node.jobTitle) {
        pushJob(node);
      }
      Object.values(node).forEach((value) => queue.push(value));
    }
  }

  return jobs;
}

async function fetchHtml(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    for (let i = 0; i < 5; i += 1) {
      const extraHeaders = options.headers || {};
      const res = await fetch(currentUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Upgrade-Insecure-Requests": "1",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          ...extraHeaders,
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 800;
        await sleep(Math.min(waitMs, 2000));
        continue;
      }

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          throw new Error("Redirect missing location");
        }
        const nextUrl = new URL(location, currentUrl).toString();
        await ensurePublicAddress(new URL(nextUrl).hostname);
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Upstream returned ${res.status}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        throw new Error("Response too large");
      }

      const html = await readStreamWithLimit(res.body, MAX_BYTES);
      const cookies = res.headers.get("set-cookie") || "";
      return { html, cookies, finalUrl: currentUrl };
    }

    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlWithScrapingBee(url) {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error("ScrapingBee API key not configured");
  }

  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url,
  });

  if (SCRAPINGBEE_RENDER_JS) {
    params.set("render_js", "true");
  }

  const requestUrl = `${SCRAPINGBEE_API_URL}?${params.toString()}`;
  const res = await fetch(requestUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`ScrapingBee returned ${res.status}`);
  }

  const html = await readStreamWithLimit(res.body, MAX_BYTES);
  return { html, cookies: "", finalUrl: url };
}

async function fetchHtmlWithZyte(url) {
  if (!ZYTE_API_KEY) {
    throw new Error("Zyte API key not configured");
  }

  const auth = Buffer.from(`${ZYTE_API_KEY}:`).toString("base64");

  const basePayload = {
    url,
    browserHtml: ZYTE_BROWSER_HTML,
  };

  const withExtract = ZYTE_STRUCTURED_DATA
    ? { ...basePayload, [ZYTE_EXTRACT_TYPE]: true }
    : basePayload;

  const request = async (payload) => {
    const res = await fetch(ZYTE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await readStreamWithLimit(res.body, MAX_BYTES);
      const snippet = body.slice(0, 800);
      throw new Error(`Zyte returned ${res.status}: ${snippet}`);
    }
    const body = await readStreamWithLimit(res.body, MAX_BYTES);
    return JSON.parse(body);
  };

  let data;
  try {
    data = await request(withExtract);
  } catch (err) {
    const message = String(err?.message || "");
    if (
      message.includes("unrecognized property extract") ||
      message.includes("unrecognized property structuredData") ||
      message.includes("unrecognized property jobPosting")
    ) {
      data = await request(basePayload);
    } else {
      throw err;
    }
  }

  if (ZYTE_DEBUG) {
    console.log(`Zyte response keys: ${Object.keys(data).join(", ")}`);
  }

  const html = data.browserHtml || data.httpResponseBody || "";
  let structured =
    data.jobPostingNavigation ||
    data.job_posting_navigation ||
    data.jobPosting ||
    data.job_posting ||
    data.structuredData ||
    data.structured_data ||
    (data.jobTitle && data.url ? data : null);

  if (!structured && data.data && (data.data.jobTitle || data.data.url)) {
    structured = data.data;
  }

  if (!structured && (data.jobTitle || data.url)) {
    structured = data;
  }

  if (ZYTE_DEBUG) {
    console.log(
      `Zyte structured type: ${
        Array.isArray(structured) ? "array" : typeof structured
      }`
    );
    try {
      const preview = JSON.stringify(structured, null, 2).slice(0, 1000);
      console.log(`Zyte structured preview: ${preview}`);
    } catch {
      console.log("Zyte structured preview: [unserializable]");
    }
  }

  if (!html) {
    throw new Error("Zyte returned empty HTML");
  }

  return { html, cookies: "", finalUrl: url, structuredData: structured };
}

export async function fetchHtmlWithPipeline(url) {
  let html;
  let cookies = "";
  let finalUrl = url;
  let zyteStructuredJobs = [];

  if (ZYTE_API_KEY && ZYTE_ALWAYS) {
    const fetched = await fetchHtmlWithZyte(url);
    html = fetched.html;
    cookies = fetched.cookies;
    finalUrl = fetched.finalUrl;
    zyteStructuredJobs = extractZyteJobs(fetched.structuredData, new URL(url).hostname);
    if (ZYTE_DEBUG) {
      console.log(`Zyte structured jobs: ${zyteStructuredJobs.length}`);
    }
    return {
      html,
      cookies,
      finalUrl,
      zyteStructuredJobs,
      fetchJson,
    };
  }

  if (SCRAPINGBEE_API_KEY && SCRAPINGBEE_ALWAYS) {
    const fetched = await fetchHtmlWithScrapingBee(url);
    html = fetched.html;
    cookies = fetched.cookies;
    finalUrl = fetched.finalUrl;
  } else {
    const fetched = await fetchHtml(url);
    html = fetched.html;
    cookies = fetched.cookies;
    finalUrl = fetched.finalUrl;
  }

  return {
    html,
    cookies,
    finalUrl,
    zyteStructuredJobs,
    fetchJson,
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    for (let i = 0; i < 5; i += 1) {
      const extraHeaders = options.headers || {};
      const res = await fetch(currentUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          ...extraHeaders,
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 800;
        await sleep(Math.min(waitMs, 2000));
        continue;
      }

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          throw new Error("Redirect missing location");
        }
        const nextUrl = new URL(location, currentUrl).toString();
        await ensurePublicAddress(new URL(nextUrl).hostname);
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Upstream returned ${res.status}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        throw new Error("Response too large");
      }

      const body = await readStreamWithLimit(res.body, MAX_BYTES);
      return JSON.parse(body);
    }

    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}
