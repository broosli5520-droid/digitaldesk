import { useState } from "react";
import { supabase, errorMessage } from "../lib/supabase";
import { money, dateOnly } from "../lib/format";
import { monthLabel, today } from "../lib/words";
import { waLink } from "../lib/whatsapp";
import { className, invoiceDue, invoiceTotal, type ClassRow, type Institute, type Invoice, type Payment, type Student } from "../lib/types";
import { Letterhead } from "./Print";
import { Button, Field, Input, Modal, Select, useToast } from "./ui";

const fmt = (inst: Institute, n: number) => money(n, inst.currency);

/** One fee challan in three copies (bank / institute / student), the format Pakistani schools use. */
export function Challan({ inst, student, cls, invoice, arrears }: { inst: Institute; student: Student; cls?: ClassRow; invoice: Invoice; arrears: number }) {
  const total = invoiceTotal(invoice);
  const payable = Math.max(total - Number(invoice.paid), 0) + arrears;
  const copy = (label: string) => (
    <div className="flex flex-col border border-slate-500 p-2 text-[10.5px] leading-tight">
      <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <Letterhead small name={inst.name} address={inst.address || inst.city} phone={inst.phone} />
      <div className="mt-1 flex justify-between border-y border-slate-400 py-0.5"><span>Challan # <b>{invoice.invoice_no}</b></span><span>{invoice.month ? monthLabel(invoice.month) : dateOnly(invoice.created_at)}</span></div>
      <div className="mt-1 space-y-0.5">
        <div>Name: <b>{student.name}</b></div>
        {student.father_name && <div>Father: {student.father_name}</div>}
        <div>Class: {className(cls)}{student.roll_no && ` · Roll ${student.roll_no}`}</div>
        <div>Adm No: <b>{student.admission_no}</b> · Due: <b>{dateOnly(invoice.due_date)}</b></div>
      </div>
      <table className="mt-1 w-full">
        <tbody>
          {invoice.items.map((it, i) => <tr key={i}><td>{it.label}</td><td className="text-right">{Number(it.amount).toLocaleString()}</td></tr>)}
          {Number(invoice.discount) > 0 && <tr><td>Concession</td><td className="text-right">−{Number(invoice.discount).toLocaleString()}</td></tr>}
          {Number(invoice.fine) > 0 && <tr><td>Late fine</td><td className="text-right">{Number(invoice.fine).toLocaleString()}</td></tr>}
          {Number(invoice.paid) > 0 && <tr><td>Already paid</td><td className="text-right">−{Number(invoice.paid).toLocaleString()}</td></tr>}
          {arrears > 0 && <tr><td>Previous dues</td><td className="text-right">{arrears.toLocaleString()}</td></tr>}
          <tr className="border-t border-slate-500 font-bold"><td>Payable by due date</td><td className="text-right">{fmt(inst, payable)}</td></tr>
          {Number(inst.late_fee) > 0 && Number(invoice.fine) === 0 && <tr><td>After due date</td><td className="text-right">{fmt(inst, payable + Number(inst.late_fee))}</td></tr>}
        </tbody>
      </table>
      {inst.bank_details && <div className="mt-1 whitespace-pre-line border-t border-dashed border-slate-400 pt-1 text-[9.5px]">{inst.bank_details}</div>}
      <div className="mt-auto flex justify-between pt-4 text-[9px] text-slate-500"><span>Received by ________</span><span>Stamp</span></div>
    </div>
  );
  return <div className="avoid-break mb-3 grid grid-cols-3 gap-2">{copy("Bank copy")}{copy("Institute copy")}{copy("Student copy")}</div>;
}

export function Receipt({ inst, student, cls, payment, invoice }: { inst: Institute; student: Student; cls?: ClassRow; payment: Payment; invoice: Invoice }) {
  const left = invoiceDue({ ...invoice });
  return (
    <div className="avoid-break mx-auto max-w-md border-2 border-emerald-700 p-4 text-sm">
      <Letterhead name={inst.name} address={inst.address || inst.city} phone={inst.phone} />
      <div className="my-2 bg-emerald-700 py-1 text-center font-semibold text-white">FEE RECEIPT</div>
      <div className="grid grid-cols-2 gap-1">
        <div>Receipt # <b>{payment.receipt_no}</b></div><div className="text-right">Date: {dateOnly(payment.paid_on)}</div>
        <div className="col-span-2">Received from: <b>{student.name}</b>{student.father_name && ` s/o ${student.father_name}`}</div>
        <div>Class: {className(cls)}</div><div className="text-right">Adm No: {student.admission_no}</div>
        <div className="col-span-2">For: {invoice.month ? `Fee ${monthLabel(invoice.month)}` : invoice.items.map((i) => i.label).join(", ")} (Challan #{invoice.invoice_no})</div>
        <div>Method: {payment.method}{payment.reference && ` · ${payment.reference}`}</div>
      </div>
      <div className="mt-3 flex justify-between border-t-2 border-slate-800 pt-2 text-lg font-bold"><span>Amount received</span><span>{fmt(inst, Number(payment.amount))}</span></div>
      <div className="text-right text-xs text-slate-600">{left > 0 ? `Remaining on this challan: ${fmt(inst, left)}` : "This challan is fully paid. Thank you!"}</div>
      <div className="mt-8 flex justify-between text-xs text-slate-500"><span>Signature ________</span><span>Stamp</span></div>
    </div>
  );
}

export function reminderText(inst: Institute, student: Student, due: number, month?: string | null) {
  return `Assalam-o-Alaikum. ${inst.name}: ${student.name} (Adm ${student.admission_no}) ki fee ${month ? monthLabel(month) + " " : ""}${fmt(inst, due)} baqi hai. Meharbani farma kar jald jama karwa dein. Shukriya.`;
}
export function reminderLink(inst: Institute, student: Student, due: number, month?: string | null) {
  return waLink(student.phone, reminderText(inst, student, due, month));
}

/** Record a payment against an invoice; returns the saved payment so the caller can print a receipt. */
export function CollectFee({ inst, student, invoice, onClose, onSaved }: { inst: Institute; student: Student; invoice: Invoice; onClose: () => void; onSaved: (p: Payment) => void }) {
  const toast = useToast();
  const due = invoiceDue(invoice);
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = Number(amount);
    if (!(n > 0)) { toast("error", "Enter the amount received"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("fee_payments").insert({ institute_id: inst.id, invoice_id: invoice.id, student_id: student.id, receipt_no: 0, amount: n, method, reference: reference.trim(), paid_on: paidOn }).select().single();
    setBusy(false);
    if (error) { toast("error", errorMessage(error)); return; }
    toast("success", `Received ${fmt(inst, n)} — receipt #${(data as Payment).receipt_no}`);
    onSaved(data as Payment);
  }
  return (
    <Modal open onClose={onClose} title={`Collect fee — ${student.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save & receipt</Button></>}>
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">Challan #{invoice.invoice_no} · {invoice.month ? monthLabel(invoice.month) : "Other"} · Due <b>{fmt(inst, due)}</b></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received"><Input type="number" min={1} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option><option value="other">Other</option></Select></Field>
        <Field label="Reference / TID (optional)"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
