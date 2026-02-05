function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function buildVacancyUrl(baseUrl, id) {
  try {
    const base = new URL(baseUrl);
    return new URL(`/vacancy/${id}/`, base.origin).toString();
  } catch {
    return null;
  }
}

export function parseTeamVkCompany($, baseUrl, context = {}) {
  const script = $("script#__NEXT_DATA__").text().trim();
  if (!script) return [];

  let data;
  try {
    data = JSON.parse(script);
  } catch {
    return [];
  }

  const vacancies =
    data?.props?.pageProps?.initialVacancies ||
    data?.props?.pageProps?.vacancies ||
    [];

  if (!Array.isArray(vacancies)) return [];

  return vacancies
    .map((item) => {
      const title = normalizeWhitespace(item.title);
      const url = buildVacancyUrl(baseUrl, item.id);
      if (!title || !url) return null;

      const company = normalizeWhitespace(item.group?.name) || context.company || null;
      const location = normalizeWhitespace(item.town?.name) || null;
      const postedAt = item.published_at || item.created_at || null;
      const tags = Array.isArray(item.tags)
        ? item.tags.map((t) => normalizeWhitespace(t.name)).filter(Boolean)
        : null;

      return {
        title,
        company,
        location,
        url,
        postedAt: postedAt ? normalizeWhitespace(postedAt) : null,
        tags: tags && tags.length ? tags : null,
      };
    })
    .filter(Boolean);
}
