import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import { supabase, errorMessage } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { dateOnly, dateTime, money } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table, Textarea, td, th, useToast } from "../components/ui";

interface Req { id: string; institute_id: string; plan_id: string; months: number; amount: number; method: string; transaction_id: string; status: string; created_at: string }
interface Inst { id: string; name: string; slug: string; kind: string; city: string; plan_id: string; plan_expires_at: string | null; students: number; created_at: string; owner_email: string }

export default function PlatformAdmin() {
  const toast = useToast();
  const isAdmin = useAsync(async () => must(await supabase.rpc("is_platform_admin")) as boolean, []);
  const data = useAsync(async () => {
    if (!isAdmin.data) return null;
    const [reqs, insts, settings] = await Promise.all([supabase.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(200), supabase.rpc("admin_institutes"), supabase.from("payment_settings").select("*").eq("id", 1).single()]);
    return { reqs: must(reqs) as Req[], insts: must(insts) as Inst[], settings: must(settings) as Record<string, string> };
  }, [isAdmin.data]);
  const [ps, setPs] = useState<Record<string, string> | null>(null);
  if (isAdmin.loading || data.loading) return <Spinner />;
  if (!isAdmin.data) return <div className="p-10 text-center text-slate-600">Only the platform owner can open this page.</div>;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? "Could not load"} />;
  const { reqs, insts, settings } = data.data;
  const s = ps ?? settings;
  const nameOf = (id: string) => insts.find((i) => i.id === id)?.name ?? id;

  async function review(r: Req, approve: boolean) {
    const { error } = await supabase.rpc("review_payment", { p_id: r.id, p_approve: approve, p_note: approve ? "" : "Payment not found — please check the transaction ID" });
    if (error) toast("error", errorMessage(error)); else { toast("success", approve ? "Approved — plan activated" : "Rejected"); void data.reload(); }
  }
  async function setPlan(i: Inst, plan: string) {
    const { error } = await supabase.rpc("admin_set_plan", { p_inst: i.id, p_plan: plan, p_months: 1 });
    if (error) toast("error", errorMessage(error)); else void data.reload();
  }
  async function saveSettings() {
    const { error } = await supabase.from("payment_settings").update({ jazzcash: s.jazzcash, easypaisa: s.easypaisa, bank_name: s.bank_name, account_title: s.account_title, account_iban: s.account_iban, instructions: s.instructions }).eq("id", 1);
    if (error) toast("error", errorMessage(error)); else { toast("success", "Saved"); setPs(null); void data.reload(); }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" />Back</Link>
      <PageHeader title="Platform admin" subtitle={`${insts.length} institutes · ${insts.reduce((a, i) => a + Number(i.students), 0)} students`} />
      <Card className="mb-6"><div className="border-b px-4 py-3 font-semibold">Payments to approve</div>
        {!reqs.length ? <p className="p-4 text-sm text-slate-500">No payments yet.</p> : <Table><thead><tr><th className={th}>Institute</th><th className={th}>Plan</th><th className={th}>Amount</th><th className={th}>TID</th><th className={th}>Status</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{reqs.map((r) => (
            <tr key={r.id}><td className={td}>{nameOf(r.institute_id)}<div className="text-xs text-slate-500">{dateTime(r.created_at)}</div></td><td className={td}>{r.plan_id} × {r.months}</td><td className={td}>{money(r.amount)}</td><td className={td}>{r.method} · <b>{r.transaction_id}</b></td>
              <td className={td}><Badge color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"}>{r.status}</Badge></td>
              <td className={`${td} whitespace-nowrap text-right`}>{r.status === "pending" && <><Button variant="ghost" onClick={() => review(r, true)} title="Approve"><Check className="h-4 w-4 text-emerald-600" /></Button><Button variant="ghost" onClick={() => review(r, false)} title="Reject"><X className="h-4 w-4 text-red-600" /></Button></>}</td></tr>))}</tbody></Table>}
        <p className="border-t px-4 py-2 text-xs text-slate-500">Check every transaction ID in your JazzCash / Easypaisa / bank app before approving.</p>
      </Card>
      <Card className="mb-6"><div className="border-b px-4 py-3 font-semibold">Institutes</div><Table>
        <thead><tr><th className={th}>Institute</th><th className={th}>Owner</th><th className={th}>Students</th><th className={th}>Plan</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{insts.map((i) => (
          <tr key={i.id}><td className={td}><div className="font-medium">{i.name}</div><div className="text-xs text-slate-500">{i.kind} · {i.city} · since {dateOnly(i.created_at)}</div></td><td className={td}>{i.owner_email}</td><td className={td}>{i.students}</td>
            <td className={td}><Select className="w-36" value={i.plan_id} onChange={(e) => setPlan(i, e.target.value)}>{["free", "basic", "standard", "premium"].map((p) => <option key={p} value={p}>{p}</option>)}</Select>{i.plan_expires_at && <div className="text-xs text-slate-500">till {dateOnly(i.plan_expires_at)}</div>}</td></tr>))}</tbody></Table></Card>
      <Card className="grid gap-4 p-5 sm:grid-cols-2"><div className="font-semibold sm:col-span-2">Where customers pay you</div>
        {(["jazzcash", "easypaisa", "bank_name", "account_title", "account_iban"] as const).map((k) => <Field key={k} label={k.replace("_", " ")}><Input value={s[k] ?? ""} onChange={(e) => setPs({ ...s, [k]: e.target.value })} /></Field>)}
        <Field label="Instructions" className="sm:col-span-2"><Textarea rows={2} value={s.instructions ?? ""} onChange={(e) => setPs({ ...s, instructions: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Button onClick={saveSettings} disabled={!ps}>Save</Button></div></Card>
    </div>
  );
}
