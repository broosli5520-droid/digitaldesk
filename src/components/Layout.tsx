import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { BarChart3, BookOpenCheck, CalendarCheck, ChevronDown, CreditCard, GraduationCap, Inbox, LayoutDashboard, Layers, LogOut, Megaphone, Menu, Plus, Receipt, Settings, ShieldCheck, UserCog, Users, Wallet, X, Briefcase } from "lucide-react";
import { BRAND } from "../lib/brand";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { CurrentInstituteProvider, useMemberships } from "../contexts/InstituteContext";
import { canView, roleLabel } from "../lib/permissions";
import { words } from "../lib/words";
import { Spinner, cx } from "./ui";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cx("flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 font-bold text-white shadow", size === "lg" ? "h-11 w-11 text-base" : "h-9 w-9 text-sm")}>DD</span>
      <span className={cx("font-bold", size === "lg" ? "text-2xl" : "text-lg")}>{BRAND.first}<span className="text-emerald-700">{BRAND.second}</span></span>
    </span>
  );
}

export default function Layout() {
  const { instituteId } = useParams();
  const { memberships, loading, reload } = useMemberships();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => { void supabase.rpc("is_platform_admin").then(({ data }) => setPlatformAdmin(data === true)); }, []);
  useEffect(() => { try { if (instituteId) localStorage.setItem("bh.lastInstitute", instituteId); } catch { /* ignore */ } }, [instituteId]);

  if (loading) return <Spinner />;
  const current = memberships.find((m) => m.institute.id === instituteId);
  if (!current) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-slate-600">This institute was not found or you no longer have access.</p>
        <Link to="/app" className="mt-4 inline-block font-medium text-emerald-700">Go to my institutes</Link>
      </div>
    );
  }
  const w = words(current.institute.kind);
  const nav = [
    { to: "", label: "Dashboard", icon: LayoutDashboard, end: true, area: null },
    { to: "students", label: "Students", icon: Users, area: "students" },
    { to: "admissions", label: "Admissions", icon: Inbox, area: "admissions" },
    { to: "attendance", label: "Attendance", icon: CalendarCheck, area: "attendance" },
    { to: "fees", label: "Fees", icon: Receipt, area: "fees" },
    { to: "exams", label: "Exams & Results", icon: BookOpenCheck, area: "exams" },
    { to: "classes", label: `${w.klasses} & Subjects`, icon: Layers, area: "classes" },
    { to: "staff", label: "Staff & Salaries", icon: Briefcase, area: "staff" },
    { to: "expenses", label: "Expenses", icon: Wallet, area: "expenses" },
    { to: "notices", label: "Notices", icon: Megaphone, area: "notices" },
    { to: "reports", label: "Reports", icon: BarChart3, area: "reports" },
    { to: "team", label: "Team & Roles", icon: UserCog, area: "team" },
    { to: "settings", label: "Settings", icon: Settings, area: "settings" },
    { to: "billing", label: "Plan & Billing", icon: CreditCard, area: "billing" },
  ].filter((n) => !n.area || canView(current.role, n.area as Parameters<typeof canView>[1]));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5"><Logo /></div>
      <div className="relative px-3">
        <button onClick={() => setSwitcher(!switcher)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{current.institute.name}</span>
            <span className="block text-xs text-slate-500">{w.kindLabel} · {roleLabel[current.role]}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        {switcher && (
          <div className="absolute left-3 right-3 z-20 mt-1 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {memberships.map((m) => (
              <button key={m.institute.id} onClick={() => { setSwitcher(false); setOpen(false); navigate(`/app/${m.institute.id}`); }}
                className={cx("block w-full px-3 py-2 text-left text-sm hover:bg-slate-50", m.institute.id === instituteId && "font-semibold text-emerald-700")}>
                {m.institute.name}
              </button>
            ))}
            <Link to="/app/new" onClick={() => setSwitcher(false)} className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm text-emerald-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" /> New institute / branch
            </Link>
          </div>
        )}
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", isActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100")}>
            <Icon className="h-4 w-4" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        {platformAdmin && (
          <Link to="/app/admin" onClick={() => setOpen(false)} className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50">
            <ShieldCheck className="h-4 w-4" /> Platform admin
          </Link>
        )}
        <div className="flex items-center gap-2 truncate px-3 pb-2 text-xs text-slate-500"><GraduationCap className="h-3.5 w-3.5" />{user?.email}</div>
        <button onClick={async () => { await signOut(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <CurrentInstituteProvider value={{ institute: current.institute, role: current.role, refresh: reload }}>
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
              <button className="absolute right-3 top-5 rounded p-1 text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="truncate font-semibold">{current.institute.name}</span>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><Outlet /></div>
          </main>
        </div>
      </div>
    </CurrentInstituteProvider>
  );
}
