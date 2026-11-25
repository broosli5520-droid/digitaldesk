import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, errorMessage } from "../lib/supabase";
import type { Institute, Membership, Role } from "../lib/types";
import { useAuth } from "./AuthContext";

interface MembershipState { memberships: Membership[]; loading: boolean; error: string | null; reload: () => Promise<void> }
const Ctx = createContext<MembershipState>({ memberships: [], loading: true, error: null, reload: async () => {} });
export const useMemberships = () => useContext(Ctx);

/** Every institute the signed-in user belongs to (pending invitations are accepted first). */
export function MembershipProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!user) { setMemberships([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      await supabase.rpc("accept_invitations");
      const { data, error } = await supabase.from("institute_members").select("role, institute:institutes(*)").eq("user_id", user.id).order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as unknown as { role: Role; institute: Institute | null }[];
      setMemberships(rows.filter((r) => r.institute).map((r) => ({ role: r.role, institute: r.institute as Institute })));
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void reload(); }, [reload]);
  return <Ctx.Provider value={{ memberships, loading, error, reload }}>{children}</Ctx.Provider>;
}

interface Current { institute: Institute; role: Role; refresh: () => Promise<void> }
const CurrentCtx = createContext<Current | null>(null);
export function CurrentInstituteProvider({ value, children }: { value: Current; children: ReactNode }) {
  return <CurrentCtx.Provider value={value}>{children}</CurrentCtx.Provider>;
}
export function useInstitute(): Current {
  const v = useContext(CurrentCtx);
  if (!v) throw new Error("useInstitute must be used inside an institute route");
  return v;
}
