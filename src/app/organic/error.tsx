"use client";

import { useEffect } from "react";

/**
 * The organic app had no error boundary anywhere, so any thrown render — a
 * stale key in a form, a null nobody expected — replaced the whole app with
 * Next's bare "Application error: a client-side exception has occurred". That
 * is how a one-line bug in the grid form (P2.1.3) reached a media buyer as
 * "the screen goes white", with nothing on the page saying what happened or
 * offering a way back (04-09-2026).
 *
 * This does not make a broken page work; it makes a broken page legible and
 * recoverable. `reset()` re-renders the segment, which is enough for anything
 * that failed on a transient value, and the digest is what ties a report from
 * the team to the line in the Vercel logs.
 */
export default function OrganicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("organic segment error:", error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="max-w-xl rounded-md border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-semibold text-red-800">This screen hit an error</h2>
        <p className="mt-1 text-xs text-red-700">
          Nothing you typed has been sent anywhere, and nothing was saved. Try again — if it
          keeps happening, pass on the reference below.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] text-red-600 font-mono">reference: {error.digest}</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded-md border border-red-300 bg-white text-red-700 text-xs font-semibold hover:bg-red-100"
          >
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}
