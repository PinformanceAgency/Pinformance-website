/**
 * The invariant behind "the screen goes white".
 *
 * A per-keyword form reads rows[k].something for every keyword it renders.
 * If the list it renders can grow — and it can, because P2.1.1 and P2.1.3
 * sit on one page and saving the first refreshes the second while it is
 * still mounted — then any key it does not hold is a thrown render, and
 * before the error boundary existed that blanked the whole app.
 *
 * Asserted here rather than trusted, because the failure is invisible until
 * somebody clicks, and by then their work is gone.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-keyed-form-rows.ts
 */
import { withMissingKeys } from "../src/app/organic/client/[orgId]/useKeyedRows";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

const make = (k: string) => ({ bucket: "", note: `seeded:${k}` });

// 1. The list grows while the form is open (the Fit Cherries crash).
{
  const first = withMissingKeys<{ bucket: string; note: string }>({}, ["a", "b"], make);
  const grown = withMissingKeys(first, ["a", "b", "c", "d"], make);
  check("a longer list is complete", ["a", "b", "c", "d"].every((k) => k in grown));
  check("typing survives the growth",
    (grown.a.note === "seeded:a") && grown === grown && Object.keys(grown).length === 4);
}

// 2. What was typed is never re-seeded over.
{
  const typed = { a: { bucket: "MOST", note: "mine" } };
  const merged = withMissingKeys(typed, ["a", "b"], make);
  check("an existing key keeps its value", merged.a.bucket === "MOST" && merged.a.note === "mine");
  check("a new key is seeded", merged.b.note === "seeded:b");
}

// 3. A restored draft that predates new keywords must still be complete —
//    this is how a draft could otherwise reintroduce the crash.
{
  const draft = { a: { bucket: "HALF", note: "from draft" } };
  const merged = withMissingKeys(draft, ["a", "b", "c"], make);
  check("a stale draft cannot leave a hole", ["a", "b", "c"].every((k) => k in merged));
}

// 4. Nothing to add must not produce a new object — that would re-render and
//    re-setState on every pass.
{
  const state = { a: make("a") };
  check("a complete list is returned unchanged", withMissingKeys(state, ["a"], make) === state);
}

// 5. A key that disappears keeps its value, so a keyword that comes back
//    finds what was typed for it.
{
  const state = { a: { bucket: "ALL", note: "kept" }, b: make("b") };
  const merged = withMissingKeys(state, ["b"], make);
  check("a removed key is not dropped", merged.a?.bucket === "ALL");
}

console.log(failures === 0 ? "\nAll keyed-row invariants hold." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
