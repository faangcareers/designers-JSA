import { URL } from "node:url";
import * as cheerio from "cheerio";
import { getAdapter } from "./adapters/index.js";
import { parseGeneric } from "./adapters/generic.js";

import {
  ensurePublicAddress,
  fetchHtmlWithPipeline,
  getCompanyFromMeta,
  collectWarnings,
  mergeJobs,
} from "./source-utils.js";

export async function parseSourceUrl(sourceUrl) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL must be http or https");
  }

  await ensurePublicAddress(parsed.hostname);

  const fetched = await fetchHtmlWithPipeline(parsed.toString());
  const $ = cheerio.load(fetched.html);
  const adapter = getAdapter(parsed.hostname);
  const company = getCompanyFromMeta($, parsed.hostname);
  const warnings = collectWarnings(fetched.html, $);

  let adapterJobs = [];
  try {
    adapterJobs = await adapter.parse($, parsed.toString(), {
      company,
      fetchJson: fetched.fetchJson,
      cookies: fetched.cookies,
      finalUrl: fetched.finalUrl,
    });
  } catch {
    warnings.push("Adapter parsing failed; falling back to generic rules.");
  }

  let jobs;
  if (adapter.name !== "generic") {
    const genericJobs = parseGeneric($, parsed.toString(), { company });
    jobs = mergeJobs(mergeJobs(adapterJobs, genericJobs), fetched.zyteStructuredJobs);
  } else {
    jobs = mergeJobs(adapterJobs, fetched.zyteStructuredJobs);
  }

  const filteredJobs = jobs.filter((job) => job.url && job.url !== parsed.toString());

  return {
    sourceUrl: parsed.toString(),
    host: parsed.hostname,
    jobs: filteredJobs,
    warnings,
  };
}
