import { useState } from "react";
import { Briefcase, Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { dateOnly, money } from "../../lib/format";
import { monthLabel, monthStart, today } from "../../lib/words";
import { canEdit } from "../../lib/permissions";
import type { SalaryPayment, Staff } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Table, confirmAction, cx, td, th, useToast } from "../../components/ui";
import { Letterhead, PrintPreview } from "../../components/Print";

export default function StaffPage() {
  const { institute, role } = useInstitute();
  const toast = useToast();
  const edit = canEdit(role, "staff");
  const [tab, setTab] = useState<"staff" | "salaries">("staff");
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const staff = useAsync(async () => must(await supabase.from("staff").select("*").eq("institute_id", institute.id).order("active", { ascending: false }).order("name")) as Staff[], [institute.id]);
  const pays = useAsync(async () => must(await supabase.from("salary_payments").select("*").eq("institute_id", institute.id).eq("month", `${month}-01`)) as SalaryPayment[], [institute.id, month]);
  const [form, setForm] = useState<Partial<Staff> | null>(null);
  const [pay, setPay] = useState<{ s: Staff; amount: string; deduction: string; note: string; paid_on: string } | null>(null);
  const [slip, setSlip] = useState<{ s: Staff; p: SalaryPayment } | null>(null);
  const m = (n: number) => money(n, institute.currency);

  async function save() {
    if (!form?.name?.trim()) return;
    const row = { institute_id: institute.id, name: form.name.trim(), designation: form.designation ?? "", phone: form.phone ?? "", monthly_salary: Number(form.monthly_salary ?? 0), joined_on: form.joined_on || null, active: form.active ?? true };
    const { error } = form.id ? await supabase.from("staff").update(row).eq("id", form.id) : await supabase.from("staff").insert(row);
    if (error) toast("error", errorMessage(error)); else { setForm(null); void staff.reload(); }
  }
  async function remove(s: Staff) {
    if (!confirmAction(`Delete ${s.name} and their salary record? (Or mark as inactive to keep history.)`)) return;
    const { error } = await supabase.from("staff").delete().eq("id", s.id);
    if (error) toast("error", errorMessage(error)); else void staff.reload();
  }
  async function paySalary() {
    if (!pay) return;
    const { data, error } = await supabase.from("salary_payments").upsert({ institute_id: institute.id, staff_id: pay.s.id, month: `${month}-01`, amount: Number(pay.amount), deduction: Number(pay.deduction || 0), note: pay.note, paid_on: pay.paid_on }, { onConflict: "staff_id,month" }).select().single();
    if (error) { toast("error", errorMessage(error)); return; }
    toast("success", "Salary recorded"); const s = pay.s; setPay(null); void pays.reload(); setSlip({ s, p: data as SalaryPayment });
  }
  async function undo(p: SalaryPayment) {
    if (!confirmAction("Remove this salary payment?")) return;
    const { error } = await supabase.from("salary_payments").delete().eq("id", p.id);
    if (error) toast("error", errorMessage(error)); else void pays.reload();
  }
  const active = (staff.data ?? []).filter((s) => s.active);
  const paidTotal = (pays.data ?? []).reduce((a, p) => a + Number(p.amount) - Number(p.deduction), 0);

  return (
    <div>
      <PageHeader title="Staff & Salaries" actions={edit && tab === "staff" && <Button onClick={() => setForm({ active: true, monthly_salary: 0 })}><Plus className="h-4 w-4" />Add staff</Button>} />
      <div className="mb-4 flex gap-2">{([["staff", "Staff"], ["salaries", "Monthly salaries"]] as const).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-emerald-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</button>))}</div>
      {staff.loading ? <Spinner /> : staff.error ? <ErrorBox message={staff.error} onRetry={staff.reload} /> : tab === "staff" ? (
        !staff.data?.length ? <Card><Empty icon={<Briefcase className="h-6 w-6" />} title="No staff yet" text="Add teachers and other staff to keep their salary record." /></Card> : (
          <Card><Table><thead><tr><th className={th}>Name</th><th className={th}>Phone</th><th className={th}>Salary</th><th className={th}>Joined</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{staff.data.map((s) => (
              <tr key={s.id}><td className={td}><div className="font-medium">{s.name} {!s.active && <Badge>Inactive</Badge>}</div><div className="text-xs text-slate-500">{s.designation}</div></td><td className={td}>{s.phone || "—"}</td><td className={td}>{m(s.monthly_salary)}</td><td className={td}>{s.joined_on ? dateOnly(s.joined_on) : "—"}</td>
                <td className={`${td} text-right`}>{edit && <><Button variant="ghost" onClick={() => setForm(s)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-red-600" /></Button></>}</td></tr>))}</tbody></Table></Card>)
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-end gap-3 p-3"><Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            <div className="ml-auto text-right text-sm"><div className="text-slate-500">Paid for {monthLabel(`${month}-01`)}</div><b className="text-lg">{m(paidTotal)}</b> <span className="text-slate-500">of {m(active.reduce((a, s) => a + Number(s.monthly_salary), 0))}</span></div></Card>
          {!active.length ? <Card><Empty icon={<Wallet className="h-6 w-6" />} title="No active staff" /></Card> : (
            <Card><Table><thead><tr><th className={th}>Name</th><th className={th}>Salary</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{active.map((s) => { const p = pays.data?.find((x) => x.staff_id === s.id); return (
                <tr key={s.id}><td className={td}><div className="font-medium">{s.name}</div><div className="text-xs text-slate-500">{s.designation}</div></td><td className={td}>{m(s.monthly_salary)}</td>
                  <td className={td}>{p ? <><Badge color="green">Paid {m(Number(p.amount) - Number(p.deduction))}</Badge><div className="text-xs text-slate-500">{dateOnly(p.paid_on)}{Number(p.deduction) > 0 && ` · deduction ${p.deduction}`}</div></> : <Badge color="amber">Unpaid</Badge>}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>{p ? <><Button variant="ghost" onClick={() => setSlip({ s, p })}><Printer className="h-4 w-4" /></Button><Button variant="ghost" onClick={() => undo(p)}>✕</Button></>
                    : <Button variant="secondary" onClick={() => setPay({ s, amount: String(s.monthly_salary), deduction: "0", note: "", paid_on: today() })}>Pay</Button>}</td></tr>); })}</tbody></Table></Card>)}
        </>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit staff" : "New staff"} footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input autoFocus value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Designation"><Input value={form.designation ?? ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Teacher / Peon / Driver" /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Monthly salary"><Input type="number" min={0} value={form.monthly_salary ?? 0} onChange={(e) => setForm({ ...form, monthly_salary: Number(e.target.value) })} /></Field>
          <Field label="Joined on"><Input type="date" value={form.joined_on ?? ""} onChange={(e) => setForm({ ...form, joined_on: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Currently working</label>
        </div>}
      </Modal>
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Pay salary — ${pay?.s.name ?? ""}`} footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button onClick={paySalary}>Save & slip</Button></>}>
        {pay && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salary"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Deduction (leave / advance)"><Input type="number" value={pay.deduction} onChange={(e) => setPay({ ...pay, deduction: e.target.value })} /></Field>
          <Field label="Paid on"><Input type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></Field>
          <Field label="Note"><Input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
        </div>}
      </Modal>
      {slip && <PrintPreview title="Salary slip" onClose={() => setSlip(null)}>
        <div className="mx-auto max-w-md border-2 border-slate-800 p-5 text-sm">
          <Letterhead name={institute.name} address={institute.address || institute.city} phone={institute.phone} />
          <div className="my-3 bg-slate-800 py-1 text-center font-semibold text-white">SALARY SLIP — {monthLabel(slip.p.month).toUpperCase()}</div>
          <div className="space-y-1"><div>Name: <b>{slip.s.name}</b></div><div>Designation: {slip.s.designation || "—"}</div><div>Paid on: {dateOnly(slip.p.paid_on)}</div></div>
          <table className="mt-3 w-full"><tbody><tr><td>Salary</td><td className="text-right">{m(slip.p.amount)}</td></tr><tr><td>Deduction</td><td className="text-right">−{m(slip.p.deduction)}</td></tr>
            <tr className="border-t-2 border-slate-800 font-bold"><td>Net paid</td><td className="text-right">{m(Number(slip.p.amount) - Number(slip.p.deduction))}</td></tr></tbody></table>
          {slip.p.note && <div className="mt-2 text-slate-600">{slip.p.note}</div>}
          <div className="mt-10 flex justify-between text-xs"><span>Received by ________</span><span>Principal ________</span></div>
        </div></PrintPreview>}
    </div>
  );
}
