import { useState } from "react";
import { Download, Plus, Trash2, Wallet } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { dateOnly, downloadCsv, money } from "../../lib/format";
import { monthStart, today } from "../../lib/words";
import type { Expense } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Table, confirmAction, td, th, useToast } from "../../components/ui";

const CATS = ["Rent", "Electricity", "Gas & water", "Internet & phone", "Stationery", "Repair & maintenance", "Furniture", "Events", "Transport", "Marketing", "Other"];

export default function Expenses() {
  const { institute } = useInstitute();
  const toast = useToast();
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).toISOString().slice(0, 10);
  const list = useAsync(async () => must(await supabase.from("expenses").select("*").eq("institute_id", institute.id).gte("spent_on", `${month}-01`).lte("spent_on", end).order("spent_on", { ascending: false })) as Expense[], [institute.id, month]);
  const [form, setForm] = useState<{ category: string; amount: string; spent_on: string; note: string } | null>(null);
  const m = (n: number) => money(n, institute.currency);
  async function save() {
    if (!form || !(Number(form.amount) > 0)) { toast("error", "Enter the amount"); return; }
    const { error } = await supabase.from("expenses").insert({ institute_id: institute.id, category: form.category, amount: Number(form.amount), spent_on: form.spent_on, note: form.note });
    if (error) toast("error", errorMessage(error)); else { setForm(null); void list.reload(); }
  }
  async function remove(e: Expense) {
    if (!confirmAction("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) toast("error", errorMessage(error)); else void list.reload();
  }
  const byCat = Object.entries((list.data ?? []).reduce<Record<string, number>>((a, e) => ({ ...a, [e.category]: (a[e.category] ?? 0) + Number(e.amount) }), {})).sort((a, b) => b[1] - a[1]);
  const total = (list.data ?? []).reduce((a, e) => a + Number(e.amount), 0);
  return (
    <div>
      <PageHeader title="Expenses" subtitle="Rent, bills, stationery… Salaries are recorded in Staff & Salaries." actions={<>
        <Button variant="secondary" disabled={!list.data?.length} onClick={() => downloadCsv(`expenses-${month}.csv`, [["Date", "Category", "Amount", "Note"], ...(list.data ?? []).map((e) => [e.spent_on, e.category, e.amount, e.note])])}><Download className="h-4 w-4" />CSV</Button>
        <Button onClick={() => setForm({ category: "Electricity", amount: "", spent_on: today(), note: "" })}><Plus className="h-4 w-4" />Add expense</Button></>} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3"><Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <div className="ml-auto text-right"><div className="text-sm text-slate-500">Total</div><b className="text-lg">{m(total)}</b></div></Card>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data?.length ? <Card><Empty icon={<Wallet className="h-6 w-6" />} title="No expenses this month" /></Card> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2"><Table><thead><tr><th className={th}>Date</th><th className={th}>Category</th><th className={th}>Amount</th><th className={th}>Note</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{list.data.map((e) => <tr key={e.id}><td className={td}>{dateOnly(e.spent_on)}</td><td className={td}>{e.category}</td><td className={td}>{m(e.amount)}</td><td className={td}>{e.note}</td><td className={`${td} text-right`}><Button variant="ghost" onClick={() => remove(e)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td></tr>)}</tbody></Table></Card>
          <Card className="p-4"><div className="font-semibold">By category</div><div className="mt-3 space-y-2">{byCat.map(([c, v]) => (
            <div key={c}><div className="flex justify-between text-sm"><span>{c}</span><span>{m(v)}</span></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-amber-500" style={{ width: `${(v / total) * 100}%` }} /></div></div>))}</div></Card>
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="Add expense" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {form && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Input list="exp-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><datalist id="exp-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Amount"><Input type="number" min={1} autoFocus value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
          <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
