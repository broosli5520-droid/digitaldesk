import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, IdCard, MessageCircle, Plus, Search, Upload, Users } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses, byRoll } from "../../lib/data";
import { downloadCsv } from "../../lib/format";
import { waLink } from "../../lib/whatsapp";
import { words } from "../../lib/words";
import { canEdit } from "../../lib/permissions";
import { className, type Student } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Select, Spinner, Table, td, th, useToast } from "../../components/ui";
import StudentForm, { type StudentDraft } from "../../components/StudentForm";
import { PrintPreview } from "../../components/Print";

export default function Students() {
  const { institute, role } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const edit = canEdit(role, "students");
  const [params, setParams] = useSearchParams();
  const classes = useClasses(institute.id);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<StudentDraft | null>(params.get("new") ? {} : null);
  const [cards, setCards] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useAsync(async () => {
    let query = supabase.from("students").select("*").eq("institute_id", institute.id);
    if (status) query = query.eq("status", status);
    if (classId) query = query.eq("class_id", classId);
    return (must(await query.order("admission_no")) as Student[]);
  }, [institute.id, classId, status]);
  const cls = (id: string | null) => classes.data?.find((c) => c.id === id);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = (list.data ?? []).filter((x) => !s || [x.name, x.father_name, x.phone, String(x.admission_no), x.roll_no, x.family_code].some((v) => v.toLowerCase().includes(s)));
    return classId ? all.sort(byRoll) : all;
  }, [list.data, q, classId]);

  function exportCsv() {
    downloadCsv(`students-${institute.slug}.csv`, [["Adm No", "Roll", "Name", "Father", "Gender", "Class", "Phone", "Phone 2", "DOB", "Monthly fee", "Concession", "Family", "Status", "Address", "Portal PIN"],
      ...rows.map((s) => [s.admission_no, s.roll_no, s.name, s.father_name, s.gender, className(cls(s.class_id)), s.phone, s.phone2, s.dob ?? "", s.monthly_fee ?? "", s.discount, s.family_code, s.status, s.address, s.portal_pin])]);
  }

  /** Import a CSV (Excel → Save as CSV). Columns by header: name, father, phone, class, roll, fee, gender, address. */
  async function importCsv(file: File) {
    const text = (await file.text()).replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parse = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    const head = parse(lines[0]).map((h) => h.toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
    const iName = col("student", "name"), iFather = col("father", "guardian"), iPhone = col("phone", "mobile", "contact"), iClass = col("class", "batch");
    const iRoll = col("roll"), iFee = col("fee"), iGender = col("gender", "sex"), iAddr = col("address");
    if (iName < 0) { toast("error", "The first row must have a 'Name' column."); return; }
    const byName = new Map((classes.data ?? []).map((c) => [className(c).toLowerCase(), c.id]));
    (classes.data ?? []).forEach((c) => byName.set(c.name.toLowerCase(), byName.get(c.name.toLowerCase()) ?? c.id));
    const rowsIn = lines.slice(1).map(parse).filter((r) => r[iName]).map((r) => ({
      institute_id: institute.id, name: r[iName], father_name: iFather >= 0 ? r[iFather] ?? "" : "", phone: iPhone >= 0 ? r[iPhone] ?? "" : "",
      class_id: iClass >= 0 ? byName.get((r[iClass] ?? "").toLowerCase()) ?? null : null, roll_no: iRoll >= 0 ? r[iRoll] ?? "" : "",
      monthly_fee: iFee >= 0 && r[iFee] ? Number(r[iFee].replace(/[^\d.]/g, "")) || null : null,
      gender: iGender >= 0 ? (/^(m|boy)/i.test(r[iGender] ?? "") ? "male" : /^(f|girl)/i.test(r[iGender] ?? "") ? "female" : "") : "",
      address: iAddr >= 0 ? r[iAddr] ?? "" : "",
    }));
    if (!rowsIn.length) { toast("error", "No students found in the file."); return; }
    const { error } = await supabase.from("students").insert(rowsIn);
    if (error) toast("error", errorMessage(error)); else { toast("success", `${rowsIn.length} students imported`); void list.reload(); }
  }

  return (
    <div>
      <PageHeader title="Students" subtitle={`${rows.length} shown`} actions={<>
        <Button variant="secondary" onClick={() => setCards(true)} disabled={!rows.length}><IdCard className="h-4 w-4" />ID cards</Button>
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Excel (CSV)</Button>
        {edit && <><Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
          <Button onClick={() => setForm({})}><Plus className="h-4 w-4" />Add student</Button></>}
      </>} />
      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Search name, father, phone, adm no, family…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All {w.klasses.toLowerCase()}</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Studying</option><option value="left">Left</option><option value="graduated">Passed out</option><option value="">All</option></Select>
      </Card>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !rows.length ? (
        <Card><Empty icon={<Users className="h-6 w-6" />} title="No students here" text={edit ? "Add students one by one, or import your Excel list (save it as CSV first: Name, Father, Phone, Class, Roll, Fee)." : undefined}
          action={edit && <Button onClick={() => setForm({})}><Plus className="h-4 w-4" />Add student</Button>} /></Card>
      ) : (
        <Card>
          <Table>
            <thead><tr><th className={th}>Adm</th><th className={th}>Student</th><th className={th}>{w.klass}</th><th className={th}>Guardian</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className={td}>{s.admission_no}{s.roll_no && <div className="text-xs text-slate-500">Roll {s.roll_no}</div>}</td>
                  <td className={td}><Link to={s.id} className="font-medium text-emerald-800 hover:underline">{s.name}</Link>
                    <div className="text-xs text-slate-500">{s.father_name && `s/o ${s.father_name}`} {s.status !== "active" && <Badge color="gray">{s.status === "left" ? "Left" : "Passed out"}</Badge>}</div></td>
                  <td className={td}>{className(cls(s.class_id))}</td>
                  <td className={td}>{s.phone || "—"}{s.family_code && <div className="text-xs text-slate-500">Family {s.family_code}</div>}</td>
                  <td className={`${td} text-right`}>{s.phone && <a href={waLink(s.phone, `Assalam-o-Alaikum. ${institute.name}: `)} target="_blank" rel="noreferrer" className="inline-flex rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {form && classes.data && <StudentForm instituteId={institute.id} classes={classes.data} initial={form} klass={w.klass}
        onClose={() => { setForm(null); if (params.get("new")) setParams({}); }} onSaved={() => { setForm(null); void list.reload(); }} />}
      {cards && (
        <PrintPreview title={`ID cards — ${rows.length} students`} onClose={() => setCards(false)}>
          <div className="grid grid-cols-2 gap-3">
            {rows.map((s) => (
              <div key={s.id} className="avoid-break overflow-hidden rounded-xl border-2 border-emerald-700 text-[12px]">
                <div className="bg-emerald-700 px-3 py-1.5 text-center text-white"><div className="font-bold">{institute.name}</div><div className="text-[10px] opacity-90">{institute.address || institute.city} {institute.phone && `· ${institute.phone}`}</div></div>
                <div className="flex gap-3 p-3">
                  <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded border border-dashed border-slate-400 text-[10px] text-slate-400">Photo</div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-bold">{s.name}</div>
                    {s.father_name && <div>Father: {s.father_name}</div>}
                    <div>{w.klass}: {className(cls(s.class_id))}{s.roll_no && ` · Roll ${s.roll_no}`}</div>
                    <div>Adm No: <b>{s.admission_no}</b>{institute.session_label && ` · ${institute.session_label}`}</div>
                    {s.phone && <div>Contact: {s.phone}</div>}
                    {institute.portal_enabled && <div className="text-[10px] text-slate-500">Parent portal PIN: {s.portal_pin}</div>}
                  </div>
                </div>
                <div className="flex justify-between border-t px-3 py-1 text-[10px] text-slate-500"><span>Valid for session {institute.session_label || new Date().getFullYear()}</span><span>Principal ________</span></div>
              </div>
            ))}
          </div>
        </PrintPreview>
      )}
    </div>
  );
}
