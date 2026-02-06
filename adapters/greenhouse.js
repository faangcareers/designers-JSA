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

function isJobUrl(url) {
  if (!url) return false;
  return /\/jobs\//i.test(url);
}

export function parseGreenhouse($, baseUrl, context = {}) {
  const jobs = [];
  const seen = new Set();

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    const url = absoluteUrl(baseUrl, href);
    if (!isJobUrl(url)) return;

    const block = $(anchor).closest("li, article, div, section").get(0) || anchor;
    const title =
      normalizeWhitespace($(block).find("h1,h2,h3").first().text()) ||
      normalizeWhitespace($(anchor).text());

    if (!title || title.toLowerCase() === "apply") return;

    const location = normalizeWhitespace($(block).find(".location").first().text()) || null;

    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    jobs.push({
      title,
      company: context.company || null,
      location,
      url,
      postedAt: null,
      tags: null,
    });
  });

  return jobs;
}
