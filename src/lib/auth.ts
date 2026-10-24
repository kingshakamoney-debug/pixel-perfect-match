import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

export function useIsAdmin(userId?: string) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId!, _role: "admin" });
      return !!data;
    },
  });
}

export function useIsSuperadmin(userId?: string) {
  return useQuery({
    queryKey: ["is-superadmin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId!, _role: "superadmin" });
      return !!data;
    },
  });
}

/** True for admin, superadmin and subadmin — the roles allowed to post forecasts and enter results. */
export function useCanManageContent(userId?: string) {
  return useQuery({
    queryKey: ["can-manage-content", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("can_manage_content", { _user_id: userId! });
      return !!data;
    },
  });
}

export function useEntitlement(userId?: string) {
  return useQuery({
    queryKey: ["entitlement", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_entitlement", { _user_id: userId! });
      if (error) throw error;
      return data?.[0] ?? { allowed: false, reason: "unpaid", expires_at: null };
    },
  });
}
