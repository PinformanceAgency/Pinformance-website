/**
 * The pacing numbers, in one place — because the same values also live in
 * the database (a CHECK on client_settings.daily_pin_target and the
 * check_daily_volume trigger), and a ceiling that disagrees with itself is
 * a rule that holds until the one call site nobody updated.
 *
 * Client-safe on purpose: no pool, no pg, so a screen can state the rule it
 * is showing without importing the publisher.
 *
 * Where these come from: module 4 of the Pinterest organic training
 * (Pinning Strategy & Systems, 13-08-2026). It teaches 1-5 pins/day for a
 * new or dormant account and 2-10 for an established one, with 48 hours
 * between two pins for the same URL on a new account and 24 on an
 * established one. Tristan settled the ceiling at 5 for every store on
 * 10-09-2026 — inside both bands, 150 pins a month, and more than a
 * sixteen-pin waterfall consumes at nine URLs a month.
 */

/** Absolute ceiling per store, per day. Mirrored by
 *  organic.check_daily_volume() and by the CHECK on daily_pin_target. */
export const ORGANIC_DAILY_CAP = 5;

/** How long a store holds one daily target before it may take the next step
 *  up. "Start with 1 pin/day, scaling to 2-5/day over weeks." */
export const SCALE_UP_STEP_DAYS = 14;

/** Hours between two pins for the SAME URL, per account class. The database
 *  trigger check_pin_spacing() enforces it from waterfalls.spacing_hours, so
 *  these two must never disagree — a store marked NEW with 24h spacing is a
 *  new account pinning at an established account's pace, which is the exact
 *  thing the classification exists to prevent. */
export const SPACING_FOR_CLASS: Record<string, number> = {
  NEW: 48,
  WARM: 48,
  ESTABLISHED: 24,
};

/** The two classes a store can be in. WARM survives in the enum for old
 *  rows; nothing offers it any more — "is this account new, yes or no" is
 *  the whole question. */
export const ACCOUNT_CLASSES = ["NEW", "ESTABLISHED"] as const;

/** Months of age below which an account counts as new, and months of silence
 *  after which it counts as new again. Both are six — decided 10-09-2026,
 *  where module 4 says twelve months for age. The looser number is a
 *  deliberate call by Tristan; the classification is a suggestion the
 *  manager can override either way, and the spacing follows whatever is
 *  chosen. */
export const NEW_ACCOUNT_MONTHS = 6;
export const DORMANT_MONTHS = 6;

/** What the dates say the class should be, for showing next to what is set.
 *  Never writes: organic.recompute_account_classes() owns the column, and it
 *  now leaves a hand-picked class alone. */
export function suggestedAccountClass(
  accountCreatedDate: string | null | undefined,
  lastActivityDate: string | null | undefined,
  today = new Date()
): { klass: "NEW" | "ESTABLISHED"; why: string } {
  const monthsAgo = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  };
  if (!accountCreatedDate) {
    return { klass: "NEW", why: "no account creation date on file — new is the safe assumption" };
  }
  const age = monthsAgo(accountCreatedDate);
  if (age < NEW_ACCOUNT_MONTHS) {
    return { klass: "NEW", why: `the account is ${Math.max(0, Math.round(age))} months old` };
  }
  if (lastActivityDate && monthsAgo(lastActivityDate) > DORMANT_MONTHS) {
    return {
      klass: "NEW",
      why: `nothing has been posted since ${lastActivityDate} — a dormant account is treated as new`,
    };
  }
  return { klass: "ESTABLISHED", why: `the account is ${Math.round(age)} months old and active` };
}
