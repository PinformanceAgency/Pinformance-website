/**
 * LIBRARY · Creative Machine — Johanne's workflow from module 3, per store.
 * A test (11-09-2026); see src/lib/organic/creative-machine.ts.
 */
import { notFound } from "next/navigation";
import { organicPool } from "@/lib/organic/db";
import { CreativeMachine } from "./CreativeMachine";

export const dynamic = "force-dynamic";

export default async function CreativePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await organicPool().query<{ name: string }>(
    `SELECT name FROM public.organizations WHERE id = $1`, [orgId]);
  if (!org.rows[0]) notFound();

  return (
    <div className="space-y-5">
      <header className="o-card px-6 py-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="o-h2 text-foreground">Creative Machine</h1>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">test</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Johanne&#39;s workflow from module 3, for {org.rows[0].name}: the brand&#39;s visual identity becomes a
          style lock, Pinterest inspiration is filtered through it, and the product photos become a library of
          scenarios. Each scenario is a prompt you paste into{" "}
          <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer" className="underline">Google Flow</a>{" "}
          together with the product photo. Upload the image you keep as a design in P4.2.4.
        </p>
      </header>
      <CreativeMachine orgId={orgId} />
    </div>
  );
}
