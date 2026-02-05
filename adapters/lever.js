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

export function parseLever($, baseUrl, context = {}) {
  const jobs = [];
  const seen = new Set();

  $("a.posting-title[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const url = href ? absoluteUrl(baseUrl, href) : null;
    if (!url) return;

    const title =
      normalizeWhitespace($(anchor).find(".posting-title__text").text()) ||
      normalizeWhitespace($(anchor).find("h5").first().text()) ||
      normalizeWhitespace($(anchor).text());

    if (!title || title.toLowerCase() === "apply") return;

    const container = $(anchor).closest(".posting");
    const categorySpans = container.find(".posting-categories span");
    const categories = categorySpans
      .map((_, el) => normalizeWhitespace($(el).text()))
      .get()
      .filter(Boolean);

    let location = null;
    let tags = null;
    if (categories.length) {
      location = categories[categories.length - 1] || null;
      if (categories.length > 1) {
        tags = categories.slice(0, -1);
      }
    }

    const key = `${title}::${url}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    jobs.push({
      title,
      company: context.company || null,
      location,
      url,
      postedAt: null,
      tags: tags && tags.length ? tags : null,
    });
  });

  return jobs;
}
