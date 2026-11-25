import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { downloadCsv, money } from "../../lib/format";
import { MONTHS, words } from "../../lib/words";
import { className, invoiceDue, invoiceTotal, type Invoice, type Student } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Table, td, th } from "../../components/ui";

export default function Reports() {
  const { institute } = useInstitute();
  const w = words(institute.kind);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const classes = useClasses(institute.id);
  const m = (n: number) => money(n, institute.currency);
  const data = useAsync(async () => {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const [pays, exps, sal, inv, studs] = await Promise.all([
      supabase.from("fee_payments").select("amount,paid_on").eq("institute_id", institute.id).gte("paid_on", from).lte("paid_on", to),
      supabase.from("expenses").select("amount,spent_on").eq("institute_id", institute.id).gte("spent_on", from).lte("spent_on", to),
      supabase.from("salary_payments").select("amount,deduction,paid_on").eq("institute_id", institute.id).gte("paid_on", from).lte("paid_on", to),
      supabase.from("fee_invoices").select("*").eq("institute_id", institute.id).gte("created_at", from).lte("created_at", `${to}T23:59:59`),
      supabase.from("students").select("id,class_id,status,gender").eq("institute_id", institute.id),
    ]);
    const months = MONTHS.map((label, i) => ({ label, income: 0, expense: 0, salary: 0, i }));
    (must(pays) as { amount: number; paid_on: string }[]).forEach((p) => { months[Number(p.paid_on.slice(5, 7)) - 1].income += Number(p.amount); });
    (must(exps) as { amount: number; spent_on: string }[]).forEach((e) => { months[Number(e.spent_on.slice(5, 7)) - 1].expense += Number(e.amount); });
    (must(sal) as { amount: number; deduction: number; paid_on: string }[]).forEach((s) => { months[Number(s.paid_on.slice(5, 7)) - 1].salary += Number(s.amount) - Number(s.deduction); });
    return { months, invoices: must(inv) as Invoice[], students: must(studs) as Pick<Student, "id" | "class_id" | "status" | "gender">[] };
  }, [institute.id, year]);

  if (data.loading || classes.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? "Could not load"} onRetry={data.reload} />;
  const { months, invoices, students } = data.data;
  const tot = months.reduce((a, x) => ({ income: a.income + x.income, expense: a.expense + x.expense, salary: a.salary + x.salary }), { income: 0, expense: 0, salary: 0 });
  const classOf = new Map(students.map((s) => [s.id, s.class_id]));
  const perClass = (classes.data ?? []).map((c) => {
    const st = students.filter((s) => s.class_id === c.id && s.status === "active");
    const inv = invoices.filter((i) => classOf.get(i.student_id) === c.id);
    return { c, count: st.length, boys: st.filter((s) => s.gender === "male").length, girls: st.filter((s) => s.gender === "female").length, billed: inv.reduce((a, i) => a + invoiceTotal(i), 0), paid: inv.reduce((a, i) => a + Number(i.paid), 0), due: inv.reduce((a, i) => a + invoiceDue(i), 0) };
  });
  return (
    <div>
      <PageHeader title="Reports" subtitle="Income vs expenses and class-wise strength & fee position" actions={<>
        <Field label=""><Input type="number" className="w-28" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        <Button variant="secondary" onClick={() => downloadCsv(`income-expense-${year}.csv`, [["Month", "Fee received", "Expenses", "Salaries", "Net"], ...months.map((x) => [x.label, x.income, x.expense, x.salary, x.income - x.expense - x.salary])])}><Download className="h-4 w-4" />CSV</Button></>} />
      <Card className="mb-6"><Table>
        <thead><tr><th className={th}>Month</th><th className={th}>Fee received</th><th className={th}>Expenses</th><th className={th}>Salaries</th><th className={th}>Net</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{months.map((x) => { const net = x.income - x.expense - x.salary; return (
          <tr key={x.label}><td className={td}>{x.label} {year}</td><td className={td}>{m(x.income)}</td><td className={td}>{m(x.expense)}</td><td className={td}>{m(x.salary)}</td><td className={`${td} font-semibold ${net < 0 ? "text-red-600" : "text-emerald-700"}`}>{m(net)}</td></tr>); })}
          <tr className="bg-slate-50 font-bold"><td className={td}>Total</td><td className={td}>{m(tot.income)}</td><td className={td}>{m(tot.expense)}</td><td className={td}>{m(tot.salary)}</td><td className={td}>{m(tot.income - tot.expense - tot.salary)}</td></tr></tbody>
      </Table></Card>
      <Card><div className="border-b px-4 py-3 font-semibold">{w.klass}-wise (invoices issued in {year})</div><Table>
        <thead><tr><th className={th}>{w.klass}</th><th className={th}>Students</th><th className={th}>Boys / Girls</th><th className={th}>Billed</th><th className={th}>Received</th><th className={th}>Outstanding</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{perClass.map((r) => (
          <tr key={r.c.id}><td className={td}>{className(r.c)}</td><td className={td}>{r.count}</td><td className={td}>{r.boys} / {r.girls}</td><td className={td}>{m(r.billed)}</td><td className={td}>{m(r.paid)}</td><td className={`${td} text-red-600`}>{m(r.due)}</td></tr>))}</tbody>
      </Table></Card>
    </div>
  );
}
