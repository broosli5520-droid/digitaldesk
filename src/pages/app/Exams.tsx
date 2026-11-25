import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Eye, EyeOff, FileText, Plus, Printer, Save, Trash2 } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { byRoll, useClasses } from "../../lib/data";
import { dateOnly } from "../../lib/format";
import { gradeFor, today, words } from "../../lib/words";
import { className, type Exam, type Mark, type Student, type Subject } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, confirmAction, cx, useToast } from "../../components/ui";
import { Letterhead, PrintPreview } from "../../components/Print";

type Cell = { obtained: string; absent: boolean };

export default function Exams() {
  const { institute } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const classes = useClasses(institute.id);
  const [classId, setClassId] = useState("");
  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data[0].id); }, [classes.data, classId]);
  const exams = useAsync(async () => (classId ? must(await supabase.from("exams").select("*").eq("class_id", classId).order("created_at", { ascending: false })) as Exam[] : []), [classId]);
  const subjects = useAsync(async () => (classId ? must(await supabase.from("subjects").select("*").eq("class_id", classId).order("sort").order("name")) as Subject[] : []), [classId]);
  const students = useAsync(async () => (classId ? (must(await supabase.from("students").select("*").eq("class_id", classId).eq("status", "active")) as Student[]).sort(byRoll) : []), [classId]);
  const [examId, setExamId] = useState("");
  useEffect(() => { setExamId(exams.data?.[0]?.id ?? ""); }, [exams.data]);
  const marks = useAsync(async () => (examId ? must(await supabase.from("marks").select("*").eq("exam_id", examId)) as Mark[] : []), [examId]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => { const c: Record<string, Cell> = {}; (marks.data ?? []).forEach((m) => { c[`${m.student_id}|${m.subject_id}`] = { obtained: m.obtained === null ? "" : String(m.obtained), absent: m.absent }; }); setCells(c); setDirty(false); }, [marks.data]);
  const [newExam, setNewExam] = useState<{ name: string; exam_date: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [print, setPrint] = useState<"sheet" | "cards" | null>(null);
  const exam = exams.data?.find((e) => e.id === examId);
  const cls = classes.data?.find((c) => c.id === classId);
  const subs = subjects.data ?? [];

  async function createExam() {
    if (!newExam?.name.trim()) return;
    const { data, error } = await supabase.from("exams").insert({ institute_id: institute.id, class_id: classId, name: newExam.name.trim(), exam_date: newExam.exam_date || null }).select().single();
    if (error) { toast("error", errorMessage(error)); return; }
    setNewExam(null); await exams.reload(); setExamId((data as Exam).id);
  }
  async function save() {
    const rows: Mark[] = [];
    for (const s of students.data ?? []) for (const sub of subs) {
      const c = cells[`${s.id}|${sub.id}`]; if (!c || (c.obtained === "" && !c.absent)) continue;
      const v = Number(c.obtained);
      if (!c.absent && (isNaN(v) || v < 0 || v > Number(sub.max_marks))) { toast("error", `${s.name} — ${sub.name}: marks must be 0–${sub.max_marks}`); return; }
      rows.push({ exam_id: examId, student_id: s.id, subject_id: sub.id, obtained: c.absent ? null : v, absent: c.absent });
    }
    setSaving(true);
    const { error } = await supabase.from("marks").upsert(rows.map((r) => ({ ...r, institute_id: institute.id })), { onConflict: "exam_id,student_id,subject_id" });
    setSaving(false);
    if (error) toast("error", errorMessage(error)); else { toast("success", "Marks saved"); setDirty(false); void marks.reload(); }
  }
  async function togglePublish() {
    if (!exam) return;
    const { error } = await supabase.from("exams").update({ published: !exam.published }).eq("id", exam.id);
    if (error) toast("error", errorMessage(error)); else { toast("success", exam.published ? "Hidden from parent portal" : "Result is now visible in the parent portal"); void exams.reload(); }
  }
  async function removeExam() {
    if (!exam || !confirmAction(`Delete ${exam.name} and all its marks?`)) return;
    const { error } = await supabase.from("exams").delete().eq("id", exam.id);
    if (error) toast("error", errorMessage(error)); else void exams.reload();
  }

  // results with positions (ties share a position)
  const results = useMemo(() => {
    const totalMax = subs.reduce((a, s) => a + Number(s.max_marks), 0);
    const rows = (students.data ?? []).map((s) => {
      const per = subs.map((sub) => { const c = cells[`${s.id}|${sub.id}`]; return { sub, obtained: c && !c.absent && c.obtained !== "" ? Number(c.obtained) : null, absent: !!c?.absent }; });
      const got = per.reduce((a, p) => a + (p.obtained ?? 0), 0);
      const pct = totalMax ? (got / totalMax) * 100 : 0;
      const failed = per.some((p) => p.absent || (p.obtained !== null && (p.obtained / Number(p.sub.max_marks)) * 100 < 33));
      return { s, per, got, pct, grade: gradeFor(pct, institute.grading), failed, position: 0 };
    });
    const sorted = [...rows].sort((a, b) => b.got - a.got);
    sorted.forEach((r, i) => { r.position = i > 0 && sorted[i - 1].got === r.got ? sorted[i - 1].position : i + 1; });
    return { rows, totalMax };
  }, [students.data, subs, cells, institute.grading]);
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

  return (
    <div>
      <PageHeader title="Exams & Results" subtitle="Enter marks once — get result sheets, positions and report cards automatically." actions={classId && <Button onClick={() => setNewExam({ name: "", exam_date: today() })}><Plus className="h-4 w-4" />New exam / test</Button>} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label={w.klass}><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
        <Field label="Exam"><Select value={examId} onChange={(e) => setExamId(e.target.value)}>{!exams.data?.length && <option value="">No exams yet</option>}{exams.data?.map((e) => <option key={e.id} value={e.id}>{e.name}{e.exam_date ? ` (${dateOnly(e.exam_date)})` : ""}</option>)}</Select></Field>
        {exam && <>
          <Button variant="secondary" onClick={togglePublish}>{exam.published ? <><EyeOff className="h-4 w-4" />Hide from parents</> : <><Eye className="h-4 w-4" />Publish to parents</>}</Button>
          <Button variant="secondary" onClick={() => setPrint("sheet")}><FileText className="h-4 w-4" />Result sheet</Button>
          <Button variant="secondary" onClick={() => setPrint("cards")}><Printer className="h-4 w-4" />Report cards</Button>
          <Button variant="ghost" onClick={removeExam}><Trash2 className="h-4 w-4 text-red-600" /></Button>
        </>}
      </Card>
      {classes.loading || subjects.loading || students.loading ? <Spinner /> : !classes.data?.length ? <Card><Empty title={`Add ${w.klasses.toLowerCase()} and subjects first`} /></Card>
        : !subs.length ? <Card><Empty icon={<BookOpenCheck className="h-6 w-6" />} title="This class has no subjects" text={`Add subjects in "${w.klasses} & Subjects" first.`} /></Card>
        : !exam ? <Card><Empty icon={<BookOpenCheck className="h-6 w-6" />} title="No exam selected" text="Create an exam or class test to start entering marks." action={<Button onClick={() => setNewExam({ name: "", exam_date: today() })}><Plus className="h-4 w-4" />New exam</Button>} /></Card>
        : marks.error ? <ErrorBox message={marks.error} /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2 text-left">Student</th>{subs.map((s) => <th key={s.id} className="px-2 py-2">{s.name}<div className="font-normal normal-case">/{s.max_marks}</div></th>)}<th className="px-2 py-2">Total</th><th className="px-2 py-2">%</th><th className="px-2 py-2">Pos.</th></tr></thead>
              <tbody className="divide-y">{results.rows.map((r) => (
                <tr key={r.s.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium">{r.s.roll_no && <span className="text-slate-400">{r.s.roll_no}. </span>}{r.s.name}</td>
                  {subs.map((sub) => { const k = `${r.s.id}|${sub.id}`; const c = cells[k] ?? { obtained: "", absent: false }; return (
                    <td key={sub.id} className="px-1 py-1 text-center">
                      <input value={c.absent ? "A" : c.obtained} inputMode="decimal" title="Type marks, or A for absent"
                        onChange={(e) => { const v = e.target.value.trim(); setCells({ ...cells, [k]: /^a$/i.test(v) ? { obtained: "", absent: true } : { obtained: v.replace(/[^\d.]/g, ""), absent: false } }); setDirty(true); }}
                        className={cx("w-16 rounded border px-2 py-1 text-center", c.absent && "bg-red-50 text-red-700", c.obtained !== "" && Number(c.obtained) > Number(sub.max_marks) && "border-red-500")} />
                    </td>); })}
                  <td className="px-2 text-center font-semibold">{r.got}</td><td className="px-2 text-center">{r.pct.toFixed(1)}</td><td className="px-2 text-center">{r.position}</td>
                </tr>))}</tbody>
            </table>
          </Card>
          <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-3 bg-slate-50/90 py-3 backdrop-blur">
            {exam.published ? <Badge color="green">Visible to parents</Badge> : <Badge>Not published</Badge>}
            <Button loading={saving} disabled={!dirty} onClick={save}><Save className="h-4 w-4" />Save marks</Button>
          </div>
        </>
      )}

      <Modal open={!!newExam} onClose={() => setNewExam(null)} title="New exam / test" footer={<><Button variant="secondary" onClick={() => setNewExam(null)}>Cancel</Button><Button onClick={createExam}>Create</Button></>}>
        {newExam && <div className="grid gap-4"><Field label="Name"><Input autoFocus value={newExam.name} onChange={(e) => setNewExam({ ...newExam, name: e.target.value })} placeholder="Mid-term / Monthly test / Final" /></Field>
          <Field label="Date"><Input type="date" value={newExam.exam_date} onChange={(e) => setNewExam({ ...newExam, exam_date: e.target.value })} /></Field></div>}
      </Modal>

      {print && exam && (
        <PrintPreview landscape={print === "sheet"} title={print === "sheet" ? "Result sheet" : "Report cards"} onClose={() => setPrint(null)}>
          {print === "sheet" ? (
            <div>
              <Letterhead name={institute.name} tagline={`Result sheet — ${exam.name} — ${className(cls)}`} address={institute.address} />
              <table className="mt-3 w-full border-collapse text-[11px]">
                <thead><tr><th className="border px-1">Pos</th><th className="border px-1 text-left">Name</th>{subs.map((s) => <th key={s.id} className="border px-1">{s.name}<br />/{s.max_marks}</th>)}<th className="border px-1">Total /{results.totalMax}</th><th className="border px-1">%</th><th className="border px-1">Grade</th><th className="border px-1">Result</th></tr></thead>
                <tbody>{[...results.rows].sort((a, b) => a.position - b.position).map((r) => (
                  <tr key={r.s.id}><td className="border text-center">{r.position}</td><td className="border px-1">{r.s.name}</td>{r.per.map((p) => <td key={p.sub.id} className="border text-center">{p.absent ? "A" : p.obtained ?? "-"}</td>)}
                    <td className="border text-center font-semibold">{r.got}</td><td className="border text-center">{r.pct.toFixed(1)}</td><td className="border text-center">{r.grade}</td><td className="border text-center">{r.failed ? "Fail" : "Pass"}</td></tr>))}</tbody>
              </table>
            </div>
          ) : results.rows.map((r) => (
            <div key={r.s.id} className="page-break avoid-break border-2 border-emerald-800 p-6">
              <Letterhead name={institute.name} tagline={institute.tagline} address={institute.address || institute.city} phone={institute.phone} />
              <div className="my-3 bg-emerald-800 py-1 text-center font-semibold tracking-wide text-white">REPORT CARD — {exam.name.toUpperCase()}</div>
              <div className="grid grid-cols-2 gap-1 text-sm">
                <div>Name: <b>{r.s.name}</b></div><div>Father: {r.s.father_name || "—"}</div>
                <div>Class: {className(cls)}</div><div>Roll / Adm: {r.s.roll_no || "—"} / {r.s.admission_no}</div>
                {institute.session_label && <div>Session: {institute.session_label}</div>}{exam.exam_date && <div>Date: {dateOnly(exam.exam_date)}</div>}
              </div>
              <table className="mt-4 w-full border-collapse text-sm">
                <thead><tr className="bg-slate-100"><th className="border px-2 py-1 text-left">Subject</th><th className="border px-2">Total</th><th className="border px-2">Obtained</th><th className="border px-2">%</th><th className="border px-2">Grade</th></tr></thead>
                <tbody>{r.per.map((p) => { const pc = p.obtained !== null ? (p.obtained / Number(p.sub.max_marks)) * 100 : 0; return (
                  <tr key={p.sub.id}><td className="border px-2 py-1">{p.sub.name}</td><td className="border text-center">{p.sub.max_marks}</td><td className="border text-center">{p.absent ? "Absent" : p.obtained ?? "—"}</td><td className="border text-center">{p.obtained !== null ? pc.toFixed(0) : "—"}</td><td className="border text-center">{p.obtained !== null ? gradeFor(pc, institute.grading) : "—"}</td></tr>); })}
                  <tr className="font-bold"><td className="border px-2 py-1">Total</td><td className="border text-center">{results.totalMax}</td><td className="border text-center">{r.got}</td><td className="border text-center">{r.pct.toFixed(1)}</td><td className="border text-center">{r.grade}</td></tr></tbody>
              </table>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded border p-2">Position<div className="text-xl font-bold">{ord(r.position)}</div></div>
                <div className="rounded border p-2">Grade<div className="text-xl font-bold">{r.grade}</div></div>
                <div className="rounded border p-2">Result<div className={cx("text-xl font-bold", r.failed ? "text-red-600" : "text-emerald-700")}>{r.failed ? "Fail" : "Pass"}</div></div>
              </div>
              <div className="mt-4 text-sm">Teacher's remarks: ________________________________________________</div>
              <div className="mt-10 flex justify-between text-sm"><span>Class teacher ________</span><span>Principal ________</span><span>Parent ________</span></div>
            </div>
          ))}
        </PrintPreview>
      )}
    </div>
  );
}
