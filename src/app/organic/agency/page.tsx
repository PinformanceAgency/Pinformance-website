import { redirect } from "next/navigation";

/** /agency has no screen of its own — portfolio is the entry point. */
export default function AgencyIndex() {
  redirect("/agency/portfolio");
}
