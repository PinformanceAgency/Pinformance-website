import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { proposeSeedPins } from "../src/lib/organic/phase3";
(async () => {
  try {
    const r = await proposeSeedPins('f9d5beed-7cff-425a-ab4a-e4695a15a82b', 0);
    console.log("RESULT", JSON.stringify({ boards: r.boards, proposed: r.proposed, candidates: r.candidates, short: r.short.length }, null, 2));
    console.log("short:", r.short.join(", "));
  } catch (e) { console.log("THREW:", (e as Error).message); }
  await organicPool().end();
})();
