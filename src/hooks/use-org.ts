"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, User } from "@/lib/types";

/**
 * Which of the three load steps failed. `error` carries the raw message for the
 * console; this says what to tell the person in front of the screen. The one
 * that matters is `no_profile`: signed in, but the account was never linked to
 * a workspace — what an invited teammate gets when the magic link goes out
 * before the invite row exists, and what used to render as a bare
 * "Unable to load your workspace."
 */
export type WorkspaceIssue = "not_authenticated" | "no_profile" | "no_org" | null;

export function useOrg() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<WorkspaceIssue>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        // Step 1: Get auth user
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setError("Not authenticated");
          setIssue("not_authenticated");
          setLoading(false);
          return;
        }

        setAuthEmail(authUser.email ?? null);

        // Step 2: Get user profile
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (profileError) {
          console.error("Profile error:", profileError.message, profileError.code);
          setError(`Profile not found: ${profileError.message}`);
          setIssue("no_profile");
          setLoading(false);
          return;
        }

        if (!profile) {
          setError("No profile data returned");
          setIssue("no_profile");
          setLoading(false);
          return;
        }

        setUser(profile as User);

        // Step 3: Determine the effective org.
        // SECURITY: active_org_id is ONLY honoured for agency_admin. Everyone else
        // is strictly scoped to their own profile.org_id.
        const isAgencyAdmin = (profile as User).role === "agency_admin";
        const effectiveOrgId = isAgencyAdmin
          ? (profile as User & { active_org_id?: string | null }).active_org_id || profile.org_id
          : profile.org_id;

        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", effectiveOrgId)
          .single();

        if (orgError) {
          console.error("Org error:", orgError.message, orgError.code);
          setError(`Organization not found: ${orgError.message}`);
          setIssue("no_org");
          setOrg(null);
        } else {
          setOrg(orgData as Organization);
        }
      } catch (err) {
        console.error("useOrg load error:", err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return {
    org,
    user,
    loading,
    error,
    issue,
    authEmail,
    isAgencyAdmin: user?.role === "agency_admin",
  };
}
