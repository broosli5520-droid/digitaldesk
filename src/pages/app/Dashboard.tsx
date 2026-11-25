import { Link } from "react-router-dom";
import { CalendarCheck, Copy, Inbox, Receipt, TrendingDown, TrendingUp, UserPlus, Users, AlertTriangle, BookOpenCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { money } from "../../lib/format";
import { MONTHS } from "../../lib/words";
import { canView } from "../../lib/permissions";
import { useInstitute } from "../../contexts/InstituteContext";
import { Card, ErrorBox, PageHeader, Spinner, useToast } from "../../components/ui";

interface Stats {
  students: number; classes: number; staff: number; new_admissions: number; today_marked: number; today_present: number; today_absent: number;
  month_collected: number; month_expenses: number; outstanding: number; defaulters: number; collection_by_month: { month: string; amount: number }[];
}

export default function Dashboard() {
  const { institute, role } = useInstitute();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(async () => must(await supabase.rpc("dashboard_stats", { p_inst: institute.id })) as Stats, [institute.id]);
  const money_ = (n: number) => money(n, institute.currency);
  const applyUrl = `${window.location.origin}/apply/${institute.slug}`;
  const portalUrl = `${window.location.origin}/portal/${institute.slug}`;
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); toast("success", "Link copied"); };
  const showMoney = canView(role, "fees");

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? "Could not load"} onRetry={reload} />;
  const max = Math.max(1, ...data.collection_by_month.map((m) => Number(m.amount)));
  const attPct = data.today_marked ? Math.round((data.today_present / data.today_marked) * 100) : null;

  const tiles = [
    { label: "Active students", value: data.students, icon: Users, to: "students", tone: "bg-emerald-50 text-emerald-700" },
    { label: "Today's attendance", value: attPct === null ? "Not marked" : `${attPct}% present`, sub: data.today_marked ? `${data.today_absent} absent` : "Mark now", icon: CalendarCheck, to: "attendance", tone: "bg-sky-50 text-sky-700" },
    { label: "New admission requests", value: data.new_admissions, icon: Inbox, to: "admissions", tone: "bg-amber-50 text-amber-700", hide: !canView(role, "admissions") },
    { label: "Fee collected this month", value: money_(data.month_collected), icon: TrendingUp, to: "fees", tone: "bg-emerald-50 text-emerald-700", hide: !showMoney },
    { label: "Fees outstanding", value: money_(data.outstanding), sub: `${data.defaulters} defaulters`, icon: AlertTriangle, to: "fees", tone: "bg-red-50 text-red-700", hide: !showMoney },
    { label: "Expenses this month", value: money_(data.month_expenses), sub: `Net ${money_(data.month_collected - data.month_expenses)}`, icon: TrendingDown, to: "expenses", tone: "bg-slate-100 text-slate-700", hide: !showMoney },
  ].filter((t) => !t.hide);

  return (
    <div>
      <PageHeader title={`Assalam-o-Alaikum 👋`} subtitle={`${institute.name}${institute.session_label ? ` · Session ${institute.session_label}` : ""}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="flex items-center gap-4 p-5 transition hover:shadow-md">
              <div className={`rounded-xl p-3 ${t.tone}`}><t.icon className="h-6 w-6" /></div>
              <div className="min-w-0">
                <div className="text-sm text-slate-500">{t.label}</div>
                <div className="truncate text-xl font-bold">{t.value}</div>
                {t.sub && <div className="text-xs text-slate-500">{t.sub}</div>}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {showMoney && (
          <Card className="p-5 lg:col-span-2">
            <h2 className="font-semibold">Fee collection — last 6 months</h2>
            {data.collection_by_month.length === 0 ? <p className="mt-6 text-sm text-slate-500">No fee collected yet. Generate this month's fees in the Fees section.</p> : (
              <div className="mt-6 flex h-48 items-end gap-3">
                {data.collection_by_month.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="text-[11px] text-slate-500">{Math.round(Number(m.amount) / 1000)}k</div>
                    <div className="w-full rounded-t-md bg-emerald-500" style={{ height: `${(Number(m.amount) / max) * 140}px` }} />
                    <div className="text-xs text-slate-600">{MONTHS[Number(m.month.slice(5)) - 1]}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
        <Card className="p-5">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            {canView(role, "students") && role !== "teacher" && role !== "accountant" && <Link to="students?new=1" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><UserPlus className="h-4 w-4 text-emerald-700" />Add a student</Link>}
            {canView(role, "attendance") && <Link to="attendance" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><CalendarCheck className="h-4 w-4 text-emerald-700" />Mark today's attendance</Link>}
            {showMoney && <Link to="fees" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><Receipt className="h-4 w-4 text-emerald-700" />Collect fee / print challans</Link>}
            {canView(role, "exams") && <Link to="exams" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><BookOpenCheck className="h-4 w-4 text-emerald-700" />Enter marks / report cards</Link>}
          </div>
          <h2 className="mt-6 font-semibold">Share with parents</h2>
          <div className="mt-2 space-y-2 text-sm">
            <button onClick={() => copy(applyUrl)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"><span className="truncate">Online admission form</span><Copy className="h-4 w-4 shrink-0" /></button>
            <button onClick={() => copy(portalUrl)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"><span className="truncate">Parent portal (fees, attendance, results)</span><Copy className="h-4 w-4 shrink-0" /></button>
          </div>
        </Card>
      </div>
    </div>
  );
}
