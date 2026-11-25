import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { BookOpenCheck, CalendarCheck, LogOut, Megaphone, Receipt } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { dateOnly, money } from "../../lib/format";
import { gradeFor, monthLabel } from "../../lib/words";
import { Badge, Button, Card, ErrorBox, Field, Input } from "../../components/ui";

interface View {
  institute: { name: string; phone: string; address: string; currency: string; bank_details: string; kind: string; grading?: { min: number; grade: string }[] };
  student: { name: string; father_name: string; admission_no: number; roll_no: string; class: string | null; status: string };
  attendance: { days: number; present: number; absent: number; leave: number; recent: { day: string; status: string }[] };
  invoices: { invoice_no: number; month: string | null; items: { label: string; amount: number }[]; total: number; paid: number; status: string; due_date: string }[];
  results: { exam: string; date: string | null; subjects: { subject: string; max: number; obtained: number | null; absent: boolean }[] }[];
  notices: { title: string; body: string; date: string }[];
}
const GRADES = [{ min: 90, grade: "A+" }, { min: 80, grade: "A" }, { min: 70, grade: "B" }, { min: 60, grade: "C" }, { min: 50, grade: "D" }, { min: 40, grade: "E" }, { min: 0, grade: "F" }];
const ATT_COLOR: Record<string, string> = { P: "bg-emerald-500", A: "bg-red-500", L: "bg-amber-400", V: "bg-sky-400" };

export default function Portal() {
  const { slug } = useParams();
  const [adm, setAdm] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { data, error } = await supabase.rpc("portal_view", { p_slug: slug, p_admission_no: Number(adm), p_pin: pin.trim() });
    setBusy(false);
    if (error) setError(errorMessage(error)); else setView(data as View);
  }
  if (!view) return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50 px-4">
      <form onSubmit={login} className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">Parent portal</h1>
        <p className="urdu text-slate-600">والدین کا پورٹل — فیس، حاضری، رزلٹ</p>
        <div className="mt-5 space-y-4">
          {error && <ErrorBox message={error} />}
          <Field label="Admission number"><Input required inputMode="numeric" value={adm} onChange={(e) => setAdm(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="PIN" hint="6-digit PIN printed on the fee challan / ID card, or ask the office."><Input required inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>
          <Button type="submit" loading={busy} className="w-full">Open</Button>
        </div>
      </form>
    </div>
  );
  const v = view; const cur = v.institute.currency;
  const due = v.invoices.filter((i) => i.status === "unpaid" || i.status === "partial").reduce((a, i) => a + Math.max(i.total - i.paid, 0), 0);
  const attPct = v.attendance.days ? Math.round((v.attendance.present / v.attendance.days) * 100) : null;
  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-emerald-800 px-4 py-5 text-white"><div className="mx-auto flex max-w-3xl items-center justify-between"><div><div className="text-sm text-emerald-100">{v.institute.name}</div><div className="text-xl font-bold">{v.student.name}</div><div className="text-sm text-emerald-100">{v.student.class ?? ""} · Adm {v.student.admission_no}{v.student.roll_no && ` · Roll ${v.student.roll_no}`}</div></div>
        <button onClick={() => { setView(null); setPin(""); }} className="rounded-lg bg-white/10 p-2" aria-label="Sign out"><LogOut className="h-5 w-5" /></button></div></header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Receipt className="h-4 w-4" />Fee due</div><div className={`text-2xl font-bold ${due > 0 ? "text-red-600" : "text-emerald-700"}`}>{money(due, cur)}</div></Card>
          <Card className="p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><CalendarCheck className="h-4 w-4" />Attendance (90 days)</div><div className="text-2xl font-bold">{attPct === null ? "—" : `${attPct}%`}</div><div className="text-xs text-slate-500">{v.attendance.absent} absent · {v.attendance.leave} leave</div></Card>
        </div>
        {!!v.attendance.recent.length && <Card className="p-4"><div className="text-sm font-semibold">Last 2 weeks</div><div className="mt-2 flex flex-wrap gap-1.5">{[...v.attendance.recent].reverse().map((a) => <span key={a.day} title={a.day} className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white ${ATT_COLOR[a.status]}`}>{a.status}</span>)}</div></Card>}
        <Card><div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><Receipt className="h-4 w-4" />Fees</div>
          {!v.invoices.length ? <p className="p-4 text-sm text-slate-500">No fee record yet.</p> : <div className="divide-y">{v.invoices.map((i) => (
            <div key={i.invoice_no} className="flex items-center justify-between gap-2 px-4 py-3 text-sm"><div><div className="font-medium">{i.month ? monthLabel(i.month) : i.items.map((x) => x.label).join(", ")}</div><div className="text-xs text-slate-500">Challan #{i.invoice_no} · due {dateOnly(i.due_date)}</div></div>
              <div className="text-right"><div>{money(i.total, cur)}</div><Badge color={i.status === "paid" ? "green" : i.status === "partial" ? "amber" : i.status === "waived" ? "gray" : "red"}>{i.status === "partial" ? `paid ${i.paid}` : i.status}</Badge></div></div>))}</div>}
          {due > 0 && v.institute.bank_details && <div className="whitespace-pre-line border-t bg-slate-50 p-4 text-sm">{v.institute.bank_details}</div>}
        </Card>
        {v.results.map((r) => { const max = r.subjects.reduce((a, s) => a + Number(s.max), 0); const got = r.subjects.reduce((a, s) => a + Number(s.obtained ?? 0), 0); const pct = max ? (got / max) * 100 : 0; return (
          <Card key={r.exam}><div className="flex items-center justify-between border-b px-4 py-3"><span className="flex items-center gap-2 font-semibold"><BookOpenCheck className="h-4 w-4" />{r.exam}</span><span className="text-sm">{got}/{max} · {pct.toFixed(1)}% · <b>{gradeFor(pct, v.institute.grading?.length ? v.institute.grading : GRADES)}</b></span></div>
            <div className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-3">{r.subjects.map((s) => <div key={s.subject} className="rounded bg-slate-50 px-3 py-2">{s.subject}<div className="font-semibold">{s.absent ? "Absent" : s.obtained ?? "—"} / {s.max}</div></div>)}</div></Card>); })}
        {!!v.notices.length && <Card><div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><Megaphone className="h-4 w-4" />Notices</div><div className="divide-y">{v.notices.map((n, k) => (
          <div key={k} className="px-4 py-3"><div className="font-medium">{n.title}</div><div className="text-xs text-slate-500">{dateOnly(n.date)}</div>{n.body && <p className="urdu-aware mt-1 whitespace-pre-line text-sm" dir="auto">{n.body}</p>}</div>))}</div></Card>}
        <p className="text-center text-xs text-slate-500">{v.institute.name}{v.institute.phone && ` · ${v.institute.phone}`}</p>
      </main>
    </div>
  );
}
