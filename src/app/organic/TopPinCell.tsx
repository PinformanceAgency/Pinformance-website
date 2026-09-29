/**
 * The week's top post in a table cell: thumbnail, title, impressions, linked
 * to the pin itself. Used on step 5 and on /agency/weekly (migration 114).
 */
import type { TopPin } from "@/lib/organic/weekly-shared";

const nf = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function TopPinCell({ pin }: { pin: TopPin | null }) {
  if (!pin) return <span className="text-o-ink-3">—</span>;
  return (
    <a
      href={`https://www.pinterest.com/pin/${pin.id}/`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 min-w-0 max-w-[16rem] group"
      title={pin.title ?? pin.id}
    >
      {pin.image
        ? <img src={pin.image} alt="" className="w-8 h-11 object-cover rounded shrink-0 bg-o-sunk" />
        : <span className="w-8 h-11 rounded shrink-0 bg-o-sunk" />}
      <span className="min-w-0">
        <span className="block truncate text-o-ink group-hover:underline">{pin.title || "Untitled pin"}</span>
        <span className="block text-[length:var(--text-o-label)] text-o-ink-3 tabular-nums">
          {nf(pin.impressions)} impr. · {nf(pin.saves)} saves · {nf(pin.outbound_clicks)} clicks
        </span>
      </span>
    </a>
  );
}
