import { useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { dateOnly, dateTime, money } from "../../lib/format";
import type { Plan } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, useToast } from "../../components/ui";

interface PaySettings { jazzcash: string; easypaisa: string; bank_name: string; account_title: string; account_iban: string; instructions: string }
interface Req { id: string; plan_id: string; months: number; amount: number; method: string; transaction_id: string; status: string; note: string; created_at: string }

export default function Billing() {
  const { institute } = useInstitute();
  const toast = useToast();
  const data = useAsync(async () => {
    const [plans, settings, reqs, count] = await Promise.all([
      supabase.from("plans").select("*").order("sort"), supabase.from("payment_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("payment_requests").select("*").eq("institute_id", institute.id).order("created_at", { ascending: false }),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("institute_id", institute.id).eq("status", "active"),
    ]);
    return { plans: must(plans) as Plan[], settings: must(settings) as PaySettings | null, reqs: must(reqs) as Req[], students: count.count ?? 0 };
  }, [institute.id]);
  const [buy, setBuy] = useState<{ plan: Plan; months: number; method: string; tid: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (data.loading) return <Spinner />;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? "Could not load"} />;
  const { plans, settings, reqs, students } = data.data;
  const active = institute.plan_id !== "free" && (!institute.plan_expires_at || new Date(institute.plan_expires_at) > new Date()) ? institute.plan_id : "free";
  const cur = plans.find((p) => p.id === active);

  async function submit() {
    if (!buy || buy.tid.trim().length < 4) { toast("error", "Enter the transaction ID from your payment SMS"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("request_plan", { p_inst: institute.id, p_plan: buy.plan.id, p_months: buy.months, p_method: buy.method, p_tid: buy.tid });
    setBusy(false);
    if (error) { toast("error", errorMessage(error)); return; }
    toast("success", "Payment sent for approval — usually within a few hours"); setBuy(null); void data.reload();
  }
  return (
    <div>
      <PageHeader title="Plan & Billing" subtitle={`Current plan: ${cur?.name ?? "Free"}${institute.plan_expires_at && active !== "free" ? ` · valid till ${dateOnly(institute.plan_expires_at)}` : ""} · ${students}${cur?.max_students ? ` / ${cur.max_students}` : ""} students`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.id} className={`flex flex-col p-5 ${p.id === active ? "ring-2 ring-emerald-600" : ""}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3>{p.id === active && <Badge color="green">Current</Badge>}</div>
            <div className="mt-2 text-2xl font-bold">{p.price_monthly ? money(p.price_monthly) : "Free"}<span className="text-sm font-normal text-slate-500">{p.price_monthly ? " / month" : " forever"}</span></div>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{f}</li>)}</ul>
            {p.price_monthly > 0 && <Button className="mt-4" onClick={() => setBuy({ plan: p, months: 1, method: "jazzcash", tid: "" })}><CreditCard className="h-4 w-4" />{p.id === active ? "Renew" : `Choose ${p.name}`}</Button>}
          </Card>
        ))}
      </div>
      {!!reqs.length && <Card className="mt-6 divide-y"><div className="px-4 py-3 font-semibold">Your payments</div>{reqs.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span>{plans.find((p) => p.id === r.plan_id)?.name} × {r.months} month(s) · {money(r.amount)} · {r.method} · TID {r.transaction_id}</span>
          <span className="flex items-center gap-2 text-slate-500">{dateTime(r.created_at)} <Badge color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"}>{r.status}</Badge></span>{r.note && <div className="w-full text-xs text-slate-500">{r.note}</div>}</div>))}</Card>}
      <Modal open={!!buy} onClose={() => setBuy(null)} title={`Buy ${buy?.plan.name ?? ""}`} footer={<><Button variant="secondary" onClick={() => setBuy(null)}>Cancel</Button><Button loading={busy} onClick={submit}>I have paid — submit</Button></>}>
        {buy && <div className="space-y-4 text-sm">
          <Field label="Months"><Select value={buy.months} onChange={(e) => setBuy({ ...buy, months: Number(e.target.value) })}>{[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""} — {money(buy.plan.price_monthly * n)}</option>)}</Select></Field>
          <div className="rounded-lg bg-emerald-50 p-3">
            <div className="font-semibold">Send {money(buy.plan.price_monthly * buy.months)} to:</div>
            {settings?.jazzcash && <div>JazzCash: <b>{settings.jazzcash}</b></div>}
            {settings?.easypaisa && <div>Easypaisa: <b>{settings.easypaisa}</b></div>}
            {settings?.account_iban && <div>{settings.bank_name}: <b>{settings.account_iban}</b> ({settings.account_title})</div>}
            {!settings?.jazzcash && !settings?.easypaisa && !settings?.account_iban && <div className="text-amber-700">Payment accounts are not set up yet. Please contact us on WhatsApp.</div>}
            {settings?.instructions && <div className="mt-1 whitespace-pre-line text-slate-600">{settings.instructions}</div>}
          </div>
          <Field label="Paid with"><Select value={buy.method} onChange={(e) => setBuy({ ...buy, method: e.target.value })}><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option><option value="bank">Bank transfer</option></Select></Field>
          <Field label="Transaction ID (from the payment SMS)"><Input value={buy.tid} onChange={(e) => setBuy({ ...buy, tid: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
