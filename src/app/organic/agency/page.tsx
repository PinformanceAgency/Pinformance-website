import { redirect } from "next/navigation";

/** /agency has no screen of its own — the week is the entry point, because
 *  that is what gets looked at every Monday. */
export default function AgencyIndex() {
  redirect("/agency/weekly");
}
