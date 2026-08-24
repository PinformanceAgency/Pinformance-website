import { redirect } from "next/navigation";

/** The store's own screens all live under named routes now, so the bare
 *  client path has no content of its own. Overview is the landing. */
export default async function ClientIndex({
  params,
}: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/client/${orgId}/overview`);
}
