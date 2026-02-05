import { parseGeneric } from "./generic.js";
import { parseLifeAtSpotify } from "./lifeatspotify.js";
import { parseTeamVkCompany } from "./team-vk-company.js";
import { parseRevolut } from "./revolut.js";
import { parseLever } from "./lever.js";

export function getAdapter(hostname) {
  if (hostname.endsWith("lifeatspotify.com")) {
    return {
      name: "lifeatspotify",
      parse: ($, baseUrl, context) => parseLifeAtSpotify($, baseUrl, context),
    };
  }

  if (hostname === "team.vk.company") {
    return {
      name: "team.vk.company",
      parse: ($, baseUrl, context) => parseTeamVkCompany($, baseUrl, context),
    };
  }

  if (hostname.endsWith("revolut.com")) {
    return {
      name: "revolut",
      parse: ($, baseUrl, context) => parseRevolut($, baseUrl, context),
    };
  }

  if (hostname === "jobs.lever.co") {
    return {
      name: "lever",
      parse: ($, baseUrl, context) => parseLever($, baseUrl, context),
    };
  }

  return {
    name: "generic",
    parse: ($, baseUrl, context) => parseGeneric($, baseUrl, context),
  };
}
