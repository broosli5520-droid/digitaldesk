import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Banknote, KeyRound, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { dateOnly, money } from "../../lib/format";
import { gradeFor, monthLabel, words } from "../../lib/words";
import { waLink } from "../../lib/whatsapp";
import { canEdit, canView } from "../../lib/permissions";
import { className, invoiceDue, invoiceTotal, type Exam, type Invoice, type Mark, type Payment, type Student, type Subject } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, Table, confirmAction, td, th, useToast } from "../../components/ui";
import StudentForm from "../../components/StudentForm";
import { PrintPreview } from "../../components/Print";
import { Challan, CollectFee, Receipt } from "../../components/FeeDocs";

const ATT = { P: ["Present", "bg-emerald-500"], A: ["Absent", "bg-red-500"], L: ["Late", "bg-amber-400"], V: ["Leave", "bg-sky-400"] } as const;

export default function StudentProfile() {
  const { studentId } = useParams();
  const { institute, role } = useInstitute();
  const navigate = useNavigate();
  const toast = useToast();
  const w = words(institute.kind);
  const money_ = (n: number) => money(n, institute.currency);
  const classes = useClasses(institute.id);
  const st = useAsync(async () => must(await supabase.from("students").select("*").eq("id", studentId!).single()) as Student, [studentId]);
  const fees = useAsync(async () => (canView(role, "fees") ? must(await supabase.from("fee_invoices").select("*").eq("student_id", studentId!).order("created_at", { ascending: false })) as Invoice[] : []), [studentId, role]);
  const pays = useAsync(async () => (canView(role, "fees") ? must(await supabase.from("fee_payments").select("*").eq("student_id", studentId!).order("receipt_no", { ascending: false })) as Payment[] : []), [studentId, role]);
  const att = useAsync(async () => must(await supabase.from("attendance").select("day,status").eq("student_id", studentId!).gte("day", new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)).order("day", { ascending: false })) as { day: string; status: keyof typeof ATT }[], [studentId]);
  const results = useAsync(async () => {
    const s = st.data; if (!s?.class_id) return [];
    const exams = must(await supabase.from("exams").select("*").eq("class_id", s.class_id).order("exam_date", { ascending: false })) as Exam[];
    const subs = must(await supabase.from("subjects").select("*").eq("class_id", s.class_id).order("sort")) as Subject[];
    const marks = must(await supabase.from("marks").select("*").eq("student_id", s.id)) as Mark[];
    return exams.map((e) => { const ms = subs.map((sub) => ({ sub, m: marks.find((m) => m.exam_id === e.id && m.subject_id === sub.id) }));
      const max = ms.reduce((a, x) => a + Number(x.sub.max_marks), 0), got = ms.reduce((a, x) => a + Number(x.m?.obtained ?? 0), 0);
      return { e, ms, max, got, pct: max ? (got / max) * 100 : 0 }; });
  }, [st.data?.id, st.data?.class_id]);
  const siblings = useAsync(async () => (st.data?.family_code ? (must(await supabase.from("students").select("*").eq("institute_id", institute.id).eq("family_code", st.data.family_code).neq("id", st.data.id)) as Student[]) : []), [st.data?.family_code]);
  const [edit, setEdit] = useState(false);
  const [collect, setCollect] = useState<Invoice | null>(null);
  const [print, setPrint] = useState<{ kind: "challan"; inv: Invoice } | { kind: "receipt"; p: Payment } | null>(null);

  if (st.loading || classes.loading) return <Spinner />;
  if (st.error || !st.data) return <ErrorBox message={st.error ?? "Not found"} />;
  const s = st.data;
  const cls = classes.data?.find((c) => c.id === s.class_id);
  const due = (fees.data ?? []).reduce((a, i) => a + invoiceDue(i), 0);
  const present = (att.data ?? []).filter((a) => a.status === "P" || a.status === "L").length;
  const pct = att.data?.length ? Math.round((present / att.data.length) * 100) : null;

  async function newPin() {
    const pin = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
    const { error } = await supabase.from("students").update({ portal_pin: pin }).eq("id", s.id);
    if (error) toast("error", errorMessage(error)); else { toast("success", `New PIN: ${pin}`); void st.reload(); }
  }
  async function remove() {
    if (!confirmAction(`Delete ${s.name} permanently, with all fee, attendance and marks records? (To keep history, set status to "Left" instead.)`)) return;
    const { error } = await supabase.from("students").delete().eq("id", s.id);
    if (error) toast("error", errorMessage(error)); else navigate(`/app/${institute.id}/students`);
  }
  const portalMsg = `Assalam-o-Alaikum. ${institute.name} parent portal: ${window.location.origin}/portal/${institute.slug}\nAdmission no: ${s.admission_no}\nPIN: ${s.portal_pin}\nYahan fees, hazri aur result dekh sakte hain.`;

  return (
    <div>
      <Link to="../students" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Students</Link>
      <PageHeader title={s.name} subtitle={`${s.father_name ? `s/o ${s.father_name} · ` : ""}${className(cls)} · Adm ${s.admission_no}${s.roll_no ? ` · Roll ${s.roll_no}` : ""}`} actions={<>
        {s.phone && <a href={waLink(s.phone, `Assalam-o-Alaikum. ${institute.name}: `)} target="_blank" rel="noreferrer"><Button variant="secondary"><MessageCircle className="h-4 w-4" />WhatsApp</Button></a>}
        {canEdit(role, "students") && <><Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="ghost" onClick={remove}><Trash2 className="h-4 w-4 text-red-600" /></Button></>}
      </>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><div className="text-sm text-slate-500">Status</div><div className="mt-1"><Badge color={s.status === "active" ? "green" : "gray"}>{s.status === "active" ? "Studying" : s.status === "left" ? "Left" : "Passed out"}</Badge></div></Card>
        <Card className="p-4"><div className="text-sm text-slate-500">Attendance (120 days)</div><div className="text-xl font-bold">{pct === null ? "—" : `${pct}%`}</div></Card>
        {canView(role, "fees") && <Card className="p-4"><div className="text-sm text-slate-500">Fee due</div><div className={`text-xl font-bold ${due > 0 ? "text-red-600" : "text-emerald-700"}`}>{money_(due)}</div></Card>}
        <Card className="p-4"><div className="text-sm text-slate-500">Monthly fee</div><div className="text-xl font-bold">{money_(Math.max(Number(s.monthly_fee ?? cls?.monthly_fee ?? 0) - Number(s.discount), 0))}</div>{Number(s.discount) > 0 && <div className="text-xs text-slate-500">after {money_(s.discount)} concession</div>}</Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canView(role, "fees") && (
            <Card>
              <div className="border-b px-4 py-3 font-semibold">Fee record</div>
              {!fees.data?.length ? <p className="p-4 text-sm text-slate-500">No invoices yet. Generate the month's fees from the Fees page.</p> : (
                <Table><thead><tr><th className={th}>#</th><th className={th}>For</th><th className={th}>Total</th><th className={th}>Paid</th><th className={th}></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{fees.data.map((i) => (
                    <tr key={i.id}><td className={td}>{i.invoice_no}</td><td className={td}>{i.month ? monthLabel(i.month) : i.items.map((x) => x.label).join(", ")}<div className="text-xs text-slate-500">Due {dateOnly(i.due_date)}</div></td>
                      <td className={td}>{money_(invoiceTotal(i))}</td><td className={td}>{money_(i.paid)} <Badge color={i.status === "paid" ? "green" : i.status === "partial" ? "amber" : i.status === "waived" ? "gray" : "red"}>{i.status}</Badge></td>
                      <td className={`${td} whitespace-nowrap text-right`}>{invoiceDue(i) > 0 && <Button variant="ghost" onClick={() => setCollect(i)} title="Collect"><Banknote className="h-4 w-4 text-emerald-700" /></Button>}<Button variant="ghost" onClick={() => setPrint({ kind: "challan", inv: i })} title="Challan"><Printer className="h-4 w-4" /></Button></td></tr>))}</tbody></Table>
              )}
              {!!pays.data?.length && <div className="border-t p-4 text-sm"><div className="mb-2 font-medium">Receipts</div><div className="flex flex-wrap gap-2">{pays.data.map((p) => (
                <button key={p.id} onClick={() => setPrint({ kind: "receipt", p })} className="rounded-lg border px-3 py-1.5 text-left hover:bg-slate-50">#{p.receipt_no} · {money_(p.amount)} · {dateOnly(p.paid_on)}</button>))}</div></div>}
            </Card>
          )}
          <Card>
            <div className="border-b px-4 py-3 font-semibold">Results</div>
            {!results.data?.length ? <p className="p-4 text-sm text-slate-500">No exams yet.</p> : results.data.map(({ e, ms, max, got, pct: p }) => (
              <div key={e.id} className="border-b p-4 last:border-0">
                <div className="flex justify-between"><b>{e.name}</b><span className="text-sm">{got}/{max} · {p.toFixed(1)}% · Grade <b>{gradeFor(p, institute.grading)}</b></span></div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">{ms.map(({ sub, m }) => <span key={sub.id} className="rounded bg-slate-100 px-2 py-1">{sub.name}: {m?.absent ? "Abs" : m?.obtained ?? "—"}/{sub.max_marks}</span>)}</div>
              </div>
            ))}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-4">
            <div className="font-semibold">Recent attendance</div>
            <div className="mt-3 flex flex-wrap gap-1">{(att.data ?? []).slice(0, 60).reverse().map((a) => <span key={a.day} title={`${a.day}: ${ATT[a.status][0]}`} className={`h-4 w-4 rounded-sm ${ATT[a.status][1]}`} />)}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">{Object.entries(ATT).map(([k, [l, c]]) => <span key={k} className="flex items-center gap-1"><span className={`h-3 w-3 rounded-sm ${c}`} />{l}</span>)}</div>
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            <div className="font-semibold">Details</div>
            <div>Phone: {s.phone || "—"} {s.phone2 && ` / ${s.phone2}`}</div>
            {s.dob && <div>Date of birth: {dateOnly(s.dob)}</div>}
            <div>Admitted: {dateOnly(s.admission_date)}</div>
            {s.address && <div>Address: {s.address}</div>}
            {s.notes && <div className="whitespace-pre-line text-slate-600">{s.notes}</div>}
          </Card>
          {institute.portal_enabled && (
            <Card className="space-y-2 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Parent portal</div>
              <div>Adm no <b>{s.admission_no}</b> · PIN <b>{s.portal_pin}</b></div>
              <div className="flex gap-2">{s.phone && <a href={waLink(s.phone, portalMsg)} target="_blank" rel="noreferrer"><Button variant="secondary">Send on WhatsApp</Button></a>}{canEdit(role, "students") && <Button variant="ghost" onClick={newPin}>New PIN</Button>}</div>
            </Card>
          )}
          {!!siblings.data?.length && (
            <Card className="p-4 text-sm"><div className="font-semibold">Brothers & sisters</div>
              <ul className="mt-2 space-y-1">{siblings.data.map((b) => <li key={b.id}><Link className="text-emerald-800 hover:underline" to={`../students/${b.id}`}>{b.name}</Link> · {className(classes.data?.find((c) => c.id === b.class_id))}</li>)}</ul></Card>
          )}
        </div>
      </div>

      {edit && classes.data && <StudentForm instituteId={institute.id} classes={classes.data} initial={s} klass={w.klass} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void st.reload(); }} />}
      {collect && <CollectFee inst={institute} student={s} invoice={collect} onClose={() => setCollect(null)} onSaved={async (p) => { setCollect(null); void pays.reload(); await fees.reload(); setPrint({ kind: "receipt", p }); }} />}
      {print?.kind === "challan" && <PrintPreview landscape title={`Challan #${print.inv.invoice_no}`} onClose={() => setPrint(null)}>
        <Challan inst={institute} student={s} cls={cls} invoice={print.inv} arrears={(fees.data ?? []).filter((o) => o.id !== print.inv.id && o.created_at < print.inv.created_at).reduce((a, o) => a + invoiceDue(o), 0)} /></PrintPreview>}
      {print?.kind === "receipt" && (() => { const inv = fees.data?.find((i) => i.id === print.p.invoice_id); return inv ? <PrintPreview title={`Receipt #${print.p.receipt_no}`} onClose={() => setPrint(null)}><Receipt inst={institute} student={s} cls={cls} payment={print.p} invoice={inv} /></PrintPreview> : null; })()}
    </div>
  );
}
