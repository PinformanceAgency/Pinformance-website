"use client";

import { useState } from "react";

/**
 * Per-key form state that stays in step with the list it was built from.
 *
 * The list can grow while the form is open. P2.1.1 (seed keywords) and P2.1.3
 * (record the grid) sit on the same step page and are both expanded by
 * default, so saving the seed keywords fires the `router.refresh()` that hands
 * the grid form a longer keyword list — without remounting it. The state was
 * built once, in a `useState` initialiser, so every new term read back as
 * undefined and the next render threw on `rows[k].fmt_simple_pins`. Nothing in
 * `src/app` is an error boundary, so that blanked the entire page: clicking a
 * format toggle turned the screen white and the toggle never ticked
 * (reproduced 04-09-2026 on the demo store).
 *
 * A `?? fallback` at the read site stops the crash but not the bug — the new
 * keyword then renders empty while the database has values for it. Seeding the
 * missing keys is what actually keeps the form honest.
 *
 * Keys already in state keep their value, so work in progress survives the
 * refresh. Keys that disappear are deliberately left in place: a keyword that
 * comes back should find what was typed for it, and the submit handlers read
 * per key from the visible list rather than iterating the whole object.
 */
/**
 * Every key in `keys` present, without disturbing the ones already there.
 *
 * Pure, exported and asserted by scripts/check-keyed-form-rows.ts, because
 * this one line is what stands between a growing keyword list and a white
 * screen — and a regression here is invisible until somebody clicks.
 */
export function withMissingKeys<T>(
  state: Record<string, T>, keys: string[], make: (key: string) => T
): Record<string, T> {
  const missing = keys.filter((k) => !(k in state));
  if (missing.length === 0) return state;
  return { ...state, ...Object.fromEntries(missing.map((k) => [k, make(k)])) };
}

export function useKeyedRows<T>(keys: string[], make: (key: string) => T) {
  const [state, setState] = useState<Record<string, T>>({});

  const rows = withMissingKeys(state, keys, make);
  const missing = rows !== state;

  // Update during render — allowed, and the right tool here: React re-runs
  // this component with the merged value before committing, and `rows` above
  // already carries it, so the pass that discovers the new keys can render
  // them instead of throwing on them.
  if (missing) setState(rows);

  return [rows, setState] as const;
}
