// Pure-logic check for the AI-draft edit-distance metric. No DB needed.
// Run: npx tsx scripts/verify-edit-distance.ts
import { editDistance } from "../src/lib/organic/internal-analytics";
const cases: Array<[string, string, number]> = [
  ["", "", 0],
  ["abc", "abc", 0],
  ["kitten", "sitting", 3],
  ["flaw", "lawn", 2],
  ["", "abc", 3],
  ["abc", "", 3],
  ["Gold hoop earrings", "Gold hoop earring", 1],
  ["a".repeat(5000), "a".repeat(5000), 0],
];
let bad = 0;
for (const [a, b, want] of cases) {
  const got = editDistance(a, b);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} d(${JSON.stringify(a.slice(0,20))}, ${JSON.stringify(b.slice(0,20))}) = ${got} (want ${want})`);
}
// kept% for a realistic half-rewrite
const gen = "Cosy autumn layering with our gold stacking rings — shop the edit.";
const app = "Layer your autumn gold — shop the stacking edit today.";
const d = editDistance(gen, app);
console.log(`kept% = ${(100 - (d / Math.max(gen.length, app.length)) * 100).toFixed(1)} (distance ${d})`);
console.log(bad === 0 ? "ALL PASS" : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
