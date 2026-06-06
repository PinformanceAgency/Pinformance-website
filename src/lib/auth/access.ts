import type { UserRole } from "@/lib/types";

/**
 * Access control for the restricted `store_owner` role.
 *
 * Store owners get a connect-only view of the dashboard: just enough to see
 * their performance and connect their own Shopify store. The allowed paths are
 * config-driven here so adding/removing a page is a one-line change.
 *
 * This is enforced in two places that both import this list:
 *  - the sidebar (hides nav items not allowed), and
 *  - <StoreOwnerGuard /> (redirects deep-links to disallowed pages).
 */
export const STORE_OWNER_PATHS = ["/overview", "/calendar", "/integrations"];

/** True if the given role may view the given dashboard path. */
export function canAccessPath(role: UserRole | undefined, pathname: string): boolean {
  if (role !== "store_owner") return true; // all other roles unaffected here
  return STORE_OWNER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export const ROLE_LABELS: Record<UserRole, string> = {
  agency_admin: "Agency Admin",
  client_admin: "Client Admin",
  client_viewer: "Client Viewer",
  store_owner: "Store Owner",
};
