"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, User } from "@/lib/types";

export function useOrg() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          console.error("Auth error:", authError);
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (profileError || !profile) {
          console.error("Profile error:", profileError);
          setLoading(false);
          return;
        }

        setUser(profile as User);

        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.org_id)
          .single();

        if (orgError) {
          console.error("Org error:", orgError);
        }

        setOrg(orgData as Organization);
      } catch (err) {
        console.error("useOrg load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { org, user, loading, isAgencyAdmin: user?.role === "agency_admin" };
}
