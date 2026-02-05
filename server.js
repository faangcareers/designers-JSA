import "dotenv/config";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import { URL } from "node:url";
import * as cheerio from "cheerio";
import { getAdapter } from "./adapters/index.js";
import { parseGeneric } from "./adapters/generic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "127.0.0.1";
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY || "";
const SCRAPINGBEE_API_URL =
  process.env.SCRAPINGBEE_API_URL || "https://app.scrapingbee.com/api/v1/";
const SCRAPINGBEE_RENDER_JS = process.env.SCRAPINGBEE_RENDER_JS === "true";
const SCRAPINGBEE_ALWAYS = process.env.SCRAPINGBEE_ALWAYS === "true";
const ZYTE_API_KEY = process.env.ZYTE_API_KEY || "";
const ZYTE_API_URL = process.env.ZYTE_API_URL || "https://api.zyte.com/v1/extract";
const ZYTE_BROWSER_HTML = process.env.ZYTE_BROWSER_HTML !== "false";
const ZYTE_STRUCTURED_DATA = process.env.ZYTE_STRUCTURED_DATA === "true";
const ZYTE_ALWAYS = process.env.ZYTE_ALWAYS === "true";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5MB
const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  return false;
}

function isBlockedHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") return true;
  if (lower.endsWith(".local")) return true;
  return false;
}

async function ensurePublicAddress(hostname) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getCompanyFromMeta($, hostname) {
  const candidates = [
    $("meta[property='og:site_name']").attr("content"),
    $("meta[name='application-name']").attr("content"),
    $("meta[name='apple-mobile-web-app-title']").attr("content"),
    $("meta[name='twitter:site']").attr("content"),
  ];

  const name = candidates.find((value) => value && value.trim());
  return name ? name.trim().replace(/^@/, "") : hostname;
}

function collectWarnings(html, $) {
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

async function fetchHtmlWithZyte(url) {
  if (!ZYTE_API_KEY) {
    throw new Error("Zyte API key not configured");
  }

  const payload = {
    url,
    browserHtml: ZYTE_BROWSER_HTML,
    structuredData: ZYTE_STRUCTURED_DATA,
  };

  const auth = Buffer.from(`${ZYTE_API_KEY}:`).toString("base64");
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
    throw new Error(`Zyte returned ${res.status}`);
  }

  const body = await readStreamWithLimit(res.body, MAX_BYTES);
  const data = JSON.parse(body);
  const html = data.browserHtml || data.httpResponseBody || "";
  if (!html) {
    throw new Error("Zyte returned empty HTML");
  }
  return { html, cookies: "", finalUrl: url };
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

function mergeJobs(primary, secondary) {
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

async function handleParse(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return json(res, 400, { error: "Invalid JSON" });
  }

  const url = data?.url?.trim();
  if (!url) {
    return json(res, 400, { error: "Missing url" });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return json(res, 400, { error: "Invalid URL" });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return json(res, 400, { error: "URL must be http or https" });
  }

  try {
    await ensurePublicAddress(parsed.hostname);
  } catch (err) {
    return json(res, 400, { error: err.message || "Blocked URL" });
  }

  let html;
  let cookies = "";
  let finalUrl = parsed.toString();
  try {
    if (ZYTE_API_KEY && ZYTE_ALWAYS) {
      console.log(`Using Zyte for: ${parsed.toString()}`);
      const fetched = await fetchHtmlWithZyte(parsed.toString());
      html = fetched.html;
      cookies = fetched.cookies;
      finalUrl = fetched.finalUrl;
    } else if (SCRAPINGBEE_API_KEY && SCRAPINGBEE_ALWAYS) {
      console.log(`Using ScrapingBee for: ${parsed.toString()}`);
      const fetched = await fetchHtmlWithScrapingBee(parsed.toString());
      html = fetched.html;
      cookies = fetched.cookies;
      finalUrl = fetched.finalUrl;
    } else {
      const fetched = await fetchHtml(parsed.toString());
      html = fetched.html;
      cookies = fetched.cookies;
      finalUrl = fetched.finalUrl;
    }
  } catch (err) {
    if (ZYTE_API_KEY && !ZYTE_ALWAYS) {
      try {
        console.log(`Direct fetch failed; retrying with Zyte: ${parsed.toString()}`);
        const fetched = await fetchHtmlWithZyte(parsed.toString());
        html = fetched.html;
        cookies = fetched.cookies;
        finalUrl = fetched.finalUrl;
      } catch (zyteErr) {
        if (SCRAPINGBEE_API_KEY && !SCRAPINGBEE_ALWAYS) {
          try {
            console.log(`Zyte failed; retrying with ScrapingBee: ${parsed.toString()}`);
            const fetched = await fetchHtmlWithScrapingBee(parsed.toString());
            html = fetched.html;
            cookies = fetched.cookies;
            finalUrl = fetched.finalUrl;
          } catch (beeErr) {
            return json(res, 502, { error: beeErr.message || "Failed to fetch URL" });
          }
        } else {
          return json(res, 502, { error: zyteErr.message || "Failed to fetch URL" });
        }
      }
    } else if (SCRAPINGBEE_API_KEY && !SCRAPINGBEE_ALWAYS) {
      try {
        console.log(`Direct fetch failed; retrying with ScrapingBee: ${parsed.toString()}`);
        const fetched = await fetchHtmlWithScrapingBee(parsed.toString());
        html = fetched.html;
        cookies = fetched.cookies;
        finalUrl = fetched.finalUrl;
      } catch (beeErr) {
        return json(res, 502, { error: beeErr.message || "Failed to fetch URL" });
      }
    } else {
      return json(res, 502, { error: err.message || "Failed to fetch URL" });
    }
  }

  const $ = cheerio.load(html);
  const adapter = getAdapter(parsed.hostname);
  const company = getCompanyFromMeta($, parsed.hostname);
  const warnings = collectWarnings(html, $);

  let jobs = [];
  let adapterJobs = [];
  try {
    adapterJobs = await adapter.parse($, parsed.toString(), {
      company,
      fetchJson,
      cookies,
      finalUrl,
    });
  } catch (err) {
    warnings.push("Adapter parsing failed; falling back to generic rules.");
  }

  if (adapter.name !== "generic") {
    const genericJobs = parseGeneric($, parsed.toString(), { company });
    jobs = mergeJobs(adapterJobs, genericJobs);
  } else {
    jobs = adapterJobs;
  }

  const response = {
    sourceUrl: parsed.toString(),
    host: parsed.hostname,
    count: jobs.length,
    jobs,
    warnings,
  };

  return json(res, 200, response);
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

const server = http.createServer(async (req, res) => {
  async function fetchHtmlViaScrapingBee(targetUrl, { renderJs = true } = {}) {
    const apiKey = process.env.SCRAPINGBEE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing SCRAPINGBEE_API_KEY in environment.");
    }

    const endpoint = new URL("https://app.scrapingbee.com/api/v1/");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("url", targetUrl);
    endpoint.searchParams.set("render_js", renderJs ? "true" : "false");

    const res = await fetch(endpoint.toString(), {
      headers: { "Accept": "text/html" },
    });

    const html = await res.text();

    if (!res.ok) {
      throw new Error(
        `ScrapingBee error ${res.status}: ${html.slice(0, 300)}`
      );
    }

    return html;
  }

  if (req.method === "POST" && req.url === "/api/parse") {
    return handleParse(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
