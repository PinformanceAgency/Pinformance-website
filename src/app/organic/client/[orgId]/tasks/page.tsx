import { redirect } from "next/navigation";

/** Legacy route. The flat task list was replaced by per-phase tabs; the
 *  onboarding work starts at phase 1. Kept so existing links and
 *  bookmarks don't 404. */
export default async function LegacyTasksRedirect({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/client/${orgId}/phase/1`);
}
