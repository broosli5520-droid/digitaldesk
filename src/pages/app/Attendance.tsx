import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCheck, Download, MessageCircle, Printer, Save } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { byRoll, useClasses } from "../../lib/data";
import { dateOnly, downloadCsv } from "../../lib/format";
import { monthLabel, today, words } from "../../lib/words";
import { waLink } from "../../lib/whatsapp";
import { className, type AttStatus, type Student } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, cx, useToast } from "../../components/ui";
import { Letterhead, PrintPreview } from "../../components/Print";

const LABEL: Record<AttStatus, string> = { P: "Present", A: "Absent", L: "Late", V: "Leave" };
const COLOR: Record<AttStatus, string> = { P: "bg-emerald-600 text-white", A: "bg-red-600 text-white", L: "bg-amber-500 text-white", V: "bg-sky-500 text-white" };

export default function Attendance() {
  const { institute } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const classes = useClasses(institute.id);
  const [tab, setTab] = useState<"mark" | "register">("mark");
  const [classId, setClassId] = useState("");
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data.find((c) => c.active)?.id ?? classes.data[0].id); }, [classes.data, classId]);

  const students = useAsync(async () => (classId ? (must(await supabase.from("students").select("*").eq("institute_id", institute.id).eq("class_id", classId).eq("status", "active")) as Student[]).sort(byRoll) : []), [institute.id, classId]);
  const marked = useAsync(async () => (classId && tab === "mark" ? must(await supabase.from("attendance").select("student_id,status").eq("institute_id", institute.id).eq("day", day).in("student_id", (students.data ?? []).map((s) => s.id))) as { student_id: string; status: AttStatus }[] : []), [institute.id, day, students.data, tab]);
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { const m: Record<string, AttStatus> = {}; (marked.data ?? []).forEach((x) => { m[x.student_id] = x.status; }); setMarks(m); setSaved((marked.data ?? []).length > 0); }, [marked.data]);

  async function save() {
    const rows = (students.data ?? []).map((s) => ({ institute_id: institute.id, student_id: s.id, day, status: marks[s.id] ?? "P" }));
    if (!rows.length) return;
    setSaving(true);
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,day" });
    setSaving(false);
    if (error) { toast("error", errorMessage(error)); return; }
    setMarks(Object.fromEntries(rows.map((r) => [r.student_id, r.status]))); setSaved(true);
    toast("success", `Attendance saved — ${rows.filter((r) => r.status === "A").length} absent`);
  }
  const absentees = (students.data ?? []).filter((s) => saved && marks[s.id] === "A");

  // ---------------- monthly register
  const register = useAsync(async () => {
    if (tab !== "register" || !classId || !students.data) return [];
    const start = `${month}-01`; const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).toISOString().slice(0, 10);
    return must(await supabase.from("attendance").select("student_id,day,status").eq("institute_id", institute.id).gte("day", start).lte("day", end).in("student_id", students.data.map((s) => s.id))) as { student_id: string; day: string; status: AttStatus }[];
  }, [tab, classId, month, students.data]);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const grid = useMemo(() => { const g = new Map<string, AttStatus>(); (register.data ?? []).forEach((r) => g.set(`${r.student_id}|${Number(r.day.slice(8))}`, r.status)); return g; }, [register.data]);
  const workingDays = useMemo(() => [...new Set((register.data ?? []).map((r) => Number(r.day.slice(8))))].sort((a, b) => a - b), [register.data]);
  const [printing, setPrinting] = useState(false);
  const cls = classes.data?.find((c) => c.id === classId);
  const summary = (sid: string) => { let p = 0, a = 0, l = 0, v = 0; workingDays.forEach((d) => { const s = grid.get(`${sid}|${d}`); if (s === "P") p++; else if (s === "A") a++; else if (s === "L") l++; else if (s === "V") v++; }); const tot = p + a + l + v; return { p, a, l, v, pct: tot ? Math.round(((p + l) / tot) * 100) : 0 }; };
  const registerTable = (
    <table className="w-full border-collapse text-[11px]">
      <thead><tr><th className="border px-1 text-left">Student</th>{Array.from({ length: daysInMonth }, (_, i) => <th key={i} className="border px-0.5">{i + 1}</th>)}<th className="border px-1">P</th><th className="border px-1">A</th><th className="border px-1">%</th></tr></thead>
      <tbody>{(students.data ?? []).map((s) => { const sm = summary(s.id); return (
        <tr key={s.id}><td className="whitespace-nowrap border px-1">{s.roll_no && `${s.roll_no}. `}{s.name}</td>
          {Array.from({ length: daysInMonth }, (_, i) => { const st = grid.get(`${s.id}|${i + 1}`); return <td key={i} className={cx("border text-center", st === "A" && "bg-red-100 font-bold text-red-700", st === "L" && "bg-amber-50", st === "V" && "bg-sky-50")}>{st ?? ""}</td>; })}
          <td className="border text-center">{sm.p + sm.l}</td><td className="border text-center">{sm.a}</td><td className="border text-center font-semibold">{sm.pct}</td></tr>); })}</tbody>
    </table>
  );

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Takes 30 seconds: everyone is Present by default — tap only the absent ones." />
      <div className="mb-4 flex gap-2">{([["mark", "Mark attendance"], ["register", "Monthly register"]] as const).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-emerald-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</button>))}</div>
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label={w.klass}><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
        {tab === "mark" ? <Field label="Date"><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
          : <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>}
        {tab === "register" && <>
          <Button variant="secondary" onClick={() => setPrinting(true)} disabled={!students.data?.length}><Printer className="h-4 w-4" />Print</Button>
          <Button variant="secondary" disabled={!students.data?.length} onClick={() => downloadCsv(`attendance-${className(cls)}-${month}.csv`, [["Roll", "Name", ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), "Present", "Absent", "%"], ...(students.data ?? []).map((s) => { const sm = summary(s.id); return [s.roll_no, s.name, ...Array.from({ length: daysInMonth }, (_, i) => grid.get(`${s.id}|${i + 1}`) ?? ""), sm.p + sm.l, sm.a, sm.pct]; })])}><Download className="h-4 w-4" />CSV</Button>
        </>}
      </Card>
      {classes.loading || students.loading ? <Spinner /> : classes.error || students.error ? <ErrorBox message={(classes.error || students.error)!} /> : !classes.data?.length ? <Card><Empty title={`Add ${w.klasses.toLowerCase()} first`} /></Card> : !students.data?.length ? (
        <Card><Empty icon={<CalendarCheck className="h-6 w-6" />} title={`No students in this ${w.klass.toLowerCase()}`} /></Card>
      ) : tab === "mark" ? (
        <>
          <Card className="divide-y">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="text-sm text-slate-500">{dateOnly(day)} · {students.data.length} students {saved && <span className="text-emerald-700">· saved</span>}</div>
              <Button variant="secondary" onClick={() => setMarks(Object.fromEntries(students.data!.map((s) => [s.id, "P" as AttStatus])))}><CheckCheck className="h-4 w-4" />All present</Button>
            </div>
            {students.data.map((s) => { const cur = marks[s.id] ?? "P"; return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{s.roll_no && <span className="text-slate-400">{s.roll_no}. </span>}{s.name}</div></div>
                <div className="flex gap-1">{(["P", "A", "L", "V"] as AttStatus[]).map((k) => (
                  <button key={k} onClick={() => { setMarks({ ...marks, [s.id]: k }); setSaved(false); }} title={LABEL[k]}
                    className={cx("h-9 w-9 rounded-lg text-sm font-bold transition", cur === k ? COLOR[k] : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>{k}</button>))}</div>
              </div>); })}
          </Card>
          <div className="sticky bottom-0 mt-4 flex justify-end gap-2 bg-slate-50/90 py-3 backdrop-blur"><Button loading={saving} onClick={save}><Save className="h-4 w-4" />Save attendance</Button></div>
          {absentees.length > 0 && (
            <Card className="mt-2 p-4">
              <div className="font-semibold">Inform parents of absent students</div>
              <div className="mt-3 flex flex-wrap gap-2">{absentees.map((s) => s.phone ? (
                <a key={s.id} target="_blank" rel="noreferrer" href={waLink(s.phone, `Assalam-o-Alaikum. ${institute.name}: ${s.name} aaj (${dateOnly(day)}) ghair hazir hai. Wajah se aagah farmaein. Shukriya.`)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50"><MessageCircle className="h-4 w-4" />{s.name}</a>) : <span key={s.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500">{s.name} (no phone)</span>)}</div>
            </Card>
          )}
        </>
      ) : register.loading ? <Spinner /> : (
        <Card className="overflow-x-auto p-3">{registerTable}<p className="mt-2 text-xs text-slate-500">{workingDays.length} days marked in {monthLabel(`${month}-01`)}. P = present, A = absent, L = late, V = leave.</p></Card>
      )}
      {printing && <PrintPreview landscape title="Attendance register" onClose={() => setPrinting(false)}>
        <Letterhead name={institute.name} tagline={`Attendance register — ${className(cls)} — ${monthLabel(`${month}-01`)}`} />
        <div className="mt-3">{registerTable}</div></PrintPreview>}
    </div>
  );
}
