import { loadAssets } from "@/lib/organic/workspace";
import { AssetsBoard } from "./AssetsBoard";

export const dynamic = "force-dynamic";

export default async function AssetsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const assets = await loadAssets(orgId);
  return <AssetsBoard orgId={orgId} initial={assets} />;
}
