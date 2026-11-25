import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Banknote, Download, FilePlus2, MessageCircle, Printer, Receipt as ReceiptIcon, Sparkles, Timer } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { dateOnly, downloadCsv, money } from "../../lib/format";
import { monthLabel, monthStart, today, words } from "../../lib/words";
import { className, invoiceDue, invoiceTotal, type Invoice, type Payment, type Student } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, confirmAction, cx, td, th, useToast } from "../../components/ui";
import { PrintPreview } from "../../components/Print";
import { Challan, CollectFee, Receipt, reminderLink } from "../../components/FeeDocs";

type Tab = "month" | "defaulters" | "collections";
const statusColor = { unpaid: "red", partial: "amber", paid: "green", waived: "gray" } as const;

export default function Fees() {
  const { institute } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const [tab, setTab] = useState<Tab>("month");
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const classes = useClasses(institute.id);
  const students = useAsync(async () => must(await supabase.from("students").select("*").eq("institute_id", institute.id)) as Student[], [institute.id]);
  const byStudent = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const cls = (id: string | null | undefined) => classes.data?.find((c) => c.id === id);

  const monthInv = useAsync(async () => must(await supabase.from("fee_invoices").select("*").eq("institute_id", institute.id).eq("month", `${month}-01`).order("invoice_no")) as Invoice[], [institute.id, month]);
  const openInv = useAsync(async () => must(await supabase.from("fee_invoices").select("*").eq("institute_id", institute.id).in("status", ["unpaid", "partial"]).order("created_at")) as Invoice[], [institute.id]);
  const payments = useAsync(async () => (tab === "collections" ? must(await supabase.from("fee_payments").select("*").eq("institute_id", institute.id).gte("paid_on", from).lte("paid_on", to).order("receipt_no", { ascending: false })) as Payment[] : []), [institute.id, tab, from, to]);

  const [gen, setGen] = useState(false);
  const [extra, setExtra] = useState({ label: "", amount: "" });
  const [genClass, setGenClass] = useState("");
  const [busy, setBusy] = useState(false);
  const [collect, setCollect] = useState<Invoice | null>(null);
  const [receipt, setReceipt] = useState<{ p: Payment; inv: Invoice } | null>(null);
  const [challans, setChallans] = useState<Invoice[] | null>(null);
  const [other, setOther] = useState(false);
  const [otherForm, setOtherForm] = useState({ student: "", label: "Admission fee", amount: "", due: today() });

  const reloadAll = () => { void monthInv.reload(); void openInv.reload(); void payments.reload(); };
  const arrearsFor = (inv: Invoice) => (openInv.data ?? []).filter((o) => o.student_id === inv.student_id && o.id !== inv.id && o.created_at < inv.created_at).reduce((a, o) => a + invoiceDue(o), 0);
  const visible = (monthInv.data ?? []).filter((i) => !classId || byStudent.get(i.student_id)?.class_id === classId);
  const totals = visible.reduce((a, i) => ({ billed: a.billed + invoiceTotal(i), paid: a.paid + Number(i.paid), due: a.due + invoiceDue(i) }), { billed: 0, paid: 0, due: 0 });

  async function generate() {
    setBusy(true);
    const items = extra.label.trim() && Number(extra.amount) > 0 ? [{ label: extra.label.trim(), amount: Number(extra.amount) }] : [];
    const { data, error } = await supabase.rpc("generate_month_fees", { p_inst: institute.id, p_month: `${month}-01`, p_class: genClass || null, p_extra: items });
    setBusy(false);
    if (error) { toast("error", errorMessage(error)); return; }
    toast("success", data ? `${data} fee invoices created for ${monthLabel(`${month}-01`)}` : "Everyone already has an invoice for this month");
    setGen(false); reloadAll();
  }
  async function fines() {
    if (!Number(institute.late_fee)) { toast("error", "Set the late fee amount in Settings first."); return; }
    if (!confirmAction(`Add the late fine (${money(institute.late_fee, institute.currency)}) to every unpaid invoice past its due date?`)) return;
    const { data, error } = await supabase.rpc("apply_late_fines", { p_inst: institute.id });
    if (error) toast("error", errorMessage(error)); else { toast("success", `Late fine added to ${data} invoices`); reloadAll(); }
  }
  async function waive(inv: Invoice) {
    if (!confirmAction(`Waive the remaining fee on challan #${inv.invoice_no}? (Use for free-ship or when a student left.)`)) return;
    const { error } = await supabase.from("fee_invoices").update({ status: "waived" }).eq("id", inv.id);
    if (error) toast("error", errorMessage(error)); else reloadAll();
  }
  async function deleteInv(inv: Invoice) {
    if (inv.paid > 0) { toast("error", "This invoice has payments. Waive it instead."); return; }
    if (!confirmAction(`Delete challan #${inv.invoice_no}?`)) return;
    const { error } = await supabase.from("fee_invoices").delete().eq("id", inv.id);
    if (error) toast("error", errorMessage(error)); else reloadAll();
  }
  async function createOther() {
    const s = otherForm.student, amt = Number(otherForm.amount);
    if (!s || !(amt > 0) || !otherForm.label.trim()) { toast("error", "Choose the student and enter the fee and amount"); return; }
    const { error } = await supabase.from("fee_invoices").insert({ institute_id: institute.id, student_id: s, invoice_no: 0, month: null, items: [{ label: otherForm.label.trim(), amount: amt }], due_date: otherForm.due });
    if (error) toast("error", errorMessage(error)); else { toast("success", "Invoice created"); setOther(false); reloadAll(); }
  }

  // defaulters: students with unpaid invoices past due
  const defaulters = useMemo(() => {
    const m = new Map<string, { student: Student; due: number; count: number; oldest: string }>();
    for (const i of openInv.data ?? []) {
      if (i.due_date >= today()) continue;
      const s = byStudent.get(i.student_id); if (!s) continue;
      const e = m.get(s.id) ?? { student: s, due: 0, count: 0, oldest: i.due_date };
      e.due += invoiceDue(i); e.count += 1; if (i.due_date < e.oldest) e.oldest = i.due_date;
      m.set(s.id, e);
    }
    return [...m.values()].filter((d) => d.due > 0 && (!classId || d.student.class_id === classId)).sort((a, b) => b.due - a.due);
  }, [openInv.data, byStudent, classId]);

  const loading = students.loading || classes.loading;
  const err = students.error || classes.error || monthInv.error || openInv.error;
  return (
    <div>
      <PageHeader title="Fees" subtitle="Monthly invoices, collection, receipts and defaulters" actions={<>
        <Button variant="secondary" onClick={() => setOther(true)}><FilePlus2 className="h-4 w-4" />Other fee</Button>
        <Button variant="secondary" onClick={fines}><Timer className="h-4 w-4" />Apply late fines</Button>
        <Button onClick={() => setGen(true)}><Sparkles className="h-4 w-4" />Generate month's fees</Button>
      </>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {([["month", "Monthly invoices"], ["defaulters", `Defaulters (${defaulters.length})`], ["collections", "Collections"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-emerald-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</button>
        ))}
      </div>
      {loading ? <Spinner /> : err ? <ErrorBox message={err} onRetry={reloadAll} /> : (
        <>
          {tab !== "collections" && (
            <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
              {tab === "month" && <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>}
              <Field label={w.klass}><Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
              {tab === "month" && <Button variant="secondary" disabled={!visible.length} onClick={() => setChallans(visible.filter((i) => invoiceDue(i) > 0))}><Printer className="h-4 w-4" />Print unpaid challans</Button>}
              {tab === "month" && <div className="ml-auto grid grid-cols-3 gap-4 text-right text-sm"><div><div className="text-slate-500">Billed</div><b>{money(totals.billed, institute.currency)}</b></div><div><div className="text-slate-500">Received</div><b className="text-emerald-700">{money(totals.paid, institute.currency)}</b></div><div><div className="text-slate-500">Balance</div><b className="text-red-600">{money(totals.due, institute.currency)}</b></div></div>}
            </Card>
          )}

          {tab === "month" && (monthInv.loading ? <Spinner /> : !visible.length ? (
            <Card><Empty icon={<ReceiptIcon className="h-6 w-6" />} title={`No fee invoices for ${monthLabel(`${month}-01`)}`} text="Generate them in one click — each student's monthly fee and concession are applied automatically."
              action={<Button onClick={() => setGen(true)}><Sparkles className="h-4 w-4" />Generate now</Button>} /></Card>
          ) : (
            <Card><Table>
              <thead><tr><th className={th}>#</th><th className={th}>Student</th><th className={th}>Total</th><th className={th}>Paid</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{visible.map((i) => { const s = byStudent.get(i.student_id); if (!s) return null; const due = invoiceDue(i); return (
                <tr key={i.id}>
                  <td className={td}>{i.invoice_no}</td>
                  <td className={td}><Link to={`../students/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-slate-500">{className(cls(s.class_id))} · Adm {s.admission_no}</div></td>
                  <td className={td}>{money(invoiceTotal(i), institute.currency)}{Number(i.fine) > 0 && <div className="text-xs text-red-600">incl. fine {i.fine}</div>}</td>
                  <td className={td}>{money(i.paid, institute.currency)}</td>
                  <td className={td}><Badge color={statusColor[i.status]}>{i.status}</Badge></td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {due > 0 && <Button variant="ghost" onClick={() => setCollect(i)} title="Collect"><Banknote className="h-4 w-4 text-emerald-700" /></Button>}
                    <Button variant="ghost" onClick={() => setChallans([i])} title="Print challan"><Printer className="h-4 w-4" /></Button>
                    {due > 0 && s.phone && <a className="inline-flex rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" target="_blank" rel="noreferrer" href={reminderLink(institute, s, due + arrearsFor(i), i.month)} title="WhatsApp reminder"><MessageCircle className="h-4 w-4" /></a>}
                    {due > 0 && <Button variant="ghost" onClick={() => waive(i)} title="Waive"><Ban className="h-4 w-4 text-slate-400" /></Button>}
                    {Number(i.paid) === 0 && <Button variant="ghost" onClick={() => deleteInv(i)} title="Delete">✕</Button>}
                  </td>
                </tr>); })}</tbody>
            </Table></Card>
          ))}

          {tab === "defaulters" && (!defaulters.length ? <Card><Empty title="No defaulters 🎉" text="Nobody has unpaid fees past the due date." /></Card> : (
            <Card><Table>
              <thead><tr><th className={th}>Student</th><th className={th}>Unpaid challans</th><th className={th}>Since</th><th className={th}>Total due</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{defaulters.map((d) => (
                <tr key={d.student.id}>
                  <td className={td}><Link to={`../students/${d.student.id}`} className="font-medium hover:underline">{d.student.name}</Link><div className="text-xs text-slate-500">{className(cls(d.student.class_id))} · {d.student.phone || "no phone"}</div></td>
                  <td className={td}>{d.count}</td><td className={td}>{dateOnly(d.oldest)}</td>
                  <td className={`${td} font-semibold text-red-600`}>{money(d.due, institute.currency)}</td>
                  <td className={`${td} text-right`}>{d.student.phone && <a className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50" target="_blank" rel="noreferrer" href={reminderLink(institute, d.student, d.due)}><MessageCircle className="h-4 w-4" />Remind</a>}</td>
                </tr>))}</tbody>
            </Table>
            <div className="border-t p-3 text-right text-sm">Total outstanding: <b className="text-red-600">{money(defaulters.reduce((a, d) => a + d.due, 0), institute.currency)}</b></div></Card>
          ))}

          {tab === "collections" && (
            <>
              <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
                <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
                <Button variant="secondary" disabled={!payments.data?.length} onClick={() => downloadCsv(`fee-collection-${from}-${to}.csv`, [["Receipt", "Date", "Student", "Adm", "Amount", "Method", "Reference"], ...(payments.data ?? []).map((p) => { const s = byStudent.get(p.student_id); return [p.receipt_no, p.paid_on, s?.name, s?.admission_no, p.amount, p.method, p.reference]; })])}><Download className="h-4 w-4" />CSV</Button>
                <div className="ml-auto text-right text-sm"><div className="text-slate-500">Total received</div><b className="text-lg text-emerald-700">{money((payments.data ?? []).reduce((a, p) => a + Number(p.amount), 0), institute.currency)}</b></div>
              </Card>
              {payments.loading ? <Spinner /> : !payments.data?.length ? <Card><Empty title="No payments in these dates" /></Card> : (
                <Card><Table>
                  <thead><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{payments.data.map((p) => { const s = byStudent.get(p.student_id); return (
                    <tr key={p.id}><td className={td}>{p.receipt_no}</td><td className={td}>{dateOnly(p.paid_on)}</td><td className={td}>{s?.name ?? "—"}</td><td className={td}>{money(p.amount, institute.currency)}</td><td className={td}>{p.method}{p.reference && ` · ${p.reference}`}</td>
                      <td className={`${td} text-right`}><Button variant="ghost" title="Print receipt" onClick={async () => { const inv = must(await supabase.from("fee_invoices").select("*").eq("id", p.invoice_id).single()) as Invoice; setReceipt({ p, inv }); }}><Printer className="h-4 w-4" /></Button></td></tr>); })}</tbody>
                </Table></Card>
              )}
            </>
          )}
        </>
      )}

      <Modal open={gen} onClose={() => setGen(false)} title={`Generate fees — ${monthLabel(`${month}-01`)}`}
        footer={<><Button variant="secondary" onClick={() => setGen(false)}>Cancel</Button><Button loading={busy} onClick={generate}>Generate</Button></>}>
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">Creates one invoice per studying student with their monthly fee and concession. Students who already have this month's invoice are skipped, so it's safe to run again for new admissions.</p>
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Field label={w.klass}><Select value={genClass} onChange={(e) => setGenClass(e.target.value)}><option value="">All {w.klasses.toLowerCase()}</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Extra charge (optional)"><Input placeholder="Exam fee / Annual fund" value={extra.label} onChange={(e) => setExtra({ ...extra, label: e.target.value })} /></Field><Field label="Amount"><Input type="number" min={0} value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value })} /></Field></div>
        </div>
      </Modal>

      <Modal open={other} onClose={() => setOther(false)} title="Other fee (admission, exam, books, transport…)"
        footer={<><Button variant="secondary" onClick={() => setOther(false)}>Cancel</Button><Button onClick={createOther}>Create invoice</Button></>}>
        <div className="grid gap-4">
          <Field label="Student"><Select value={otherForm.student} onChange={(e) => setOtherForm({ ...otherForm, student: e.target.value })}><option value="">Choose…</option>
            {(students.data ?? []).filter((s) => s.status === "active").sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name} — {className(cls(s.class_id))} (Adm {s.admission_no})</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Fee"><Input value={otherForm.label} onChange={(e) => setOtherForm({ ...otherForm, label: e.target.value })} /></Field><Field label="Amount"><Input type="number" min={1} value={otherForm.amount} onChange={(e) => setOtherForm({ ...otherForm, amount: e.target.value })} /></Field></div>
          <Field label="Due date"><Input type="date" value={otherForm.due} onChange={(e) => setOtherForm({ ...otherForm, due: e.target.value })} /></Field>
        </div>
      </Modal>

      {collect && byStudent.get(collect.student_id) && <CollectFee inst={institute} student={byStudent.get(collect.student_id)!} invoice={collect} onClose={() => setCollect(null)}
        onSaved={async (p) => { const inv = collect; setCollect(null); reloadAll(); const fresh = must(await supabase.from("fee_invoices").select("*").eq("id", inv.id).single()) as Invoice; setReceipt({ p, inv: fresh }); }} />}
      {receipt && byStudent.get(receipt.p.student_id) && (
        <PrintPreview title={`Receipt #${receipt.p.receipt_no}`} onClose={() => setReceipt(null)}>
          <Receipt inst={institute} student={byStudent.get(receipt.p.student_id)!} cls={cls(byStudent.get(receipt.p.student_id)!.class_id)} payment={receipt.p} invoice={receipt.inv} />
        </PrintPreview>
      )}
      {challans && (
        <PrintPreview landscape title={`${challans.length} fee challan(s)`} onClose={() => setChallans(null)}>
          {challans.map((i) => { const s = byStudent.get(i.student_id); return s ? <Challan key={i.id} inst={institute} student={s} cls={cls(s.class_id)} invoice={i} arrears={arrearsFor(i)} /> : null; })}
        </PrintPreview>
      )}
    </div>
  );
}
