import { redirect } from "next/navigation";

/** Legacy route. Cycles moved into the phase-based navigation as phase 4.
 *  Kept so existing links and bookmarks don't 404. */
export default async function LegacyCyclesRedirect({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/client/${orgId}/phase/4`);
}
