import { useState } from "react";
import { Save } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { slugify } from "../../lib/format";
import type { Institute } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Button, Card, Field, Input, PageHeader, Select, Textarea, useToast } from "../../components/ui";

export default function SettingsPage() {
  const { institute, refresh } = useInstitute();
  const toast = useToast();
  const [f, setF] = useState<Institute>(institute);
  const [grading, setGrading] = useState(institute.grading.map((g) => `${g.min}=${g.grade}`).join(", "));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Institute>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    const parsed = grading.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [min, grade] = x.split("="); return { min: Number(min), grade: (grade ?? "").trim() }; });
    if (parsed.some((g) => isNaN(g.min) || !g.grade)) { toast("error", "Grading must look like: 90=A+, 80=A, 70=B, 0=F"); return; }
    setSaving(true);
    const { error } = await supabase.from("institutes").update({
      name: f.name, slug: slugify(f.slug), kind: f.kind, tagline: f.tagline, phone: f.phone, email: f.email, address: f.address, city: f.city, principal_name: f.principal_name,
      session_label: f.session_label, currency: f.currency, fee_due_day: Number(f.fee_due_day), late_fee: Number(f.late_fee), bank_details: f.bank_details,
      admissions_open: f.admissions_open, admission_note: f.admission_note, portal_enabled: f.portal_enabled, grading: parsed,
    }).eq("id", institute.id);
    setSaving(false);
    if (error) toast("error", errorMessage(error)); else { toast("success", "Settings saved"); await refresh(); }
  }
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" actions={<Button loading={saving} onClick={save}><Save className="h-4 w-4" />Save</Button>} />
      <div className="space-y-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Institute (printed on challans, receipts & report cards)</h2>
          <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Type"><Select value={f.kind} onChange={(e) => set({ kind: e.target.value as Institute["kind"] })}><option value="school">School</option><option value="tuition">Tuition centre</option><option value="academy">Academy</option><option value="madrasa">Madrasa</option><option value="college">College</option></Select></Field>
          <Field label="Tagline / motto"><Input value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
          <Field label="Principal / head"><Input value={f.principal_name} onChange={(e) => set({ principal_name: e.target.value })} /></Field>
          <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="Current session"><Input value={f.session_label} onChange={(e) => set({ session_label: e.target.value })} placeholder="2026-27" /></Field>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Fees</h2>
          <Field label="Due day of month"><Input type="number" min={1} max={28} value={f.fee_due_day} onChange={(e) => set({ fee_due_day: Number(e.target.value) })} /></Field>
          <Field label="Late fine (after due date)"><Input type="number" min={0} value={f.late_fee} onChange={(e) => set({ late_fee: Number(e.target.value) })} /></Field>
          <Field label="Currency"><Input value={f.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 5) })} /></Field>
          <Field label="Bank / JazzCash details for the challan" className="sm:col-span-3"><Textarea rows={3} value={f.bank_details} onChange={(e) => set({ bank_details: e.target.value })} placeholder={"Meezan Bank, A/C Title: Al-Noor School\nA/C # 0123-4567890\nJazzCash: 0300-1234567"} /></Field>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Online admissions & parent portal</h2>
          <Field label="Link name" hint={`${window.location.origin}/apply/${f.slug} · /portal/${f.slug}`}><Input value={f.slug} onChange={(e) => set({ slug: e.target.value })} /></Field>
          <div className="space-y-2 self-end text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.admissions_open} onChange={(e) => set({ admissions_open: e.target.checked })} /> Admissions open (form accepts requests)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.portal_enabled} onChange={(e) => set({ portal_enabled: e.target.checked })} /> Parent portal on</label>
          </div>
          <Field label="Message on the admission form" className="sm:col-span-2"><Textarea rows={2} dir="auto" value={f.admission_note} onChange={(e) => set({ admission_note: e.target.value })} placeholder="Admissions open for session 2026-27. Test on Saturday 10 am." /></Field>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Grading</h2>
          <Field label="Minimum % = grade" hint="Used on result sheets and report cards. A subject below 33% counts as fail."><Input value={grading} onChange={(e) => setGrading(e.target.value)} /></Field>
        </Card>
      </div>
    </div>
  );
}
