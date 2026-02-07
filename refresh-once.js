import "dotenv/config";
import { refreshAllSources } from "./refresh.js";
import { STAGE } from "./stage-config.js";

async function main() {
  console.log(`[refresh-once] stage=${STAGE} started`);
  const results = await refreshAllSources();
  const success = results.filter((r) => r.status === "ok").length;
  const failed = results.length - success;
  console.log(
    `[refresh-once] stage=${STAGE} done: total=${results.length}, ok=${success}, failed=${failed}`
  );
}

main().catch((err) => {
  console.error("[refresh-once] failed", err);
  process.exitCode = 1;
});

