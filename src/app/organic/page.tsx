import { loadClientList } from "@/lib/organic/queries";
import { ClientsBoard } from "./ClientsBoard";

export const dynamic = "force-dynamic";

export default async function OrganicHomePage() {
  const rows = await loadClientList();
  return <ClientsBoard rows={rows} />;
}
