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
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      setUser(profile as User);

      const { data: orgData } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.org_id)
        .single();

      setOrg(orgData as Organization);
      setLoading(false);
    }

    load();
  }, []);

  return { org, user, loading, isAgencyAdmin: user?.role === "agency_admin" };
}
