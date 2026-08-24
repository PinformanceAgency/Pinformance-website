import { AgencyTabs } from "./AgencyTabs";
import { Label } from "@/components/organic/primitives";

export const dynamic = "force-dynamic";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="pb-6 mb-6 border-b border-o-hairline">
        <Label>Agency</Label>
        <h1 className="o-display mt-1.5 text-[length:var(--text-o-figure-lg)] font-semibold text-o-ink leading-none tracking-[-0.015em]">
          The book
        </h1>
        <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 max-w-[42rem]">
          Every store at once. Which make money, which lose money, and where the
          delivery is stuck — without opening fifty pages.
        </p>
      </header>

      <AgencyTabs />
      <div className="mt-8">{children}</div>
    </div>
  );
}
