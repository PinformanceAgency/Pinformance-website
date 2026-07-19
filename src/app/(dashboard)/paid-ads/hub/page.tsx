import { redirect } from "next/navigation";

// The Media Buying Hub lives in its own sidebar section now; keep the old
// URL working for bookmarks.
export default function OldHubRedirect() {
  redirect("/media-buying-hub/overview");
}
