import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import { loadIntake, loadAccess } from "@/lib/organic/intake";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [header, intake, access] = await Promise.all([
    loadClientHeader(orgId),
    loadIntake(orgId),
    loadAccess(orgId),
  ]);
  if (!header) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/client/${orgId}`} className="text-xs text-neutral-500 hover:text-neutral-900">
          ← Back to {header.name}
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold">Intake — {header.name}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          One submit fills client intake, access, niche + account dates, and marks all eleven
          P1.1 tasks DONE. Account class re-calculates on save.
        </p>
      </div>
      <IntakeForm orgId={orgId} initialIntake={intake} initialAccess={access} initialDomain={header.domain} />
    </div>
  );
}
