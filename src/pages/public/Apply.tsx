import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, MapPin, Phone } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { Button, ErrorBox, Field, Input, Select, Spinner, Textarea } from "../../components/ui";

interface Pub { name: string; kind: string; tagline: string; phone: string; address: string; city: string; admissions_open: boolean; admission_note: string; classes: string[] }

export default function Apply() {
  const { slug } = useParams();
  const inst = useAsync(async () => must(await supabase.rpc("get_public_institute", { p_slug: slug })) as Pub | null, [slug]);
  const [f, setF] = useState({ student_name: "", father_name: "", phone: "", class_wanted: "", dob: "", gender: "", address: "", previous_school: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await supabase.rpc("submit_admission", { p_slug: slug, p: f });
    setBusy(false);
    if (error) setError(errorMessage(error)); else setDone(true);
  }
  if (inst.loading) return <Spinner />;
  if (!inst.data) return <div className="p-10 text-center text-slate-600">This admission form link is not valid.</div>;
  const i = inst.data;
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-800 to-emerald-900 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="text-center text-white">
          <h1 className="text-3xl font-bold">{i.name}</h1>
          {i.tagline && <p className="mt-1 text-emerald-100">{i.tagline}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-sm text-emerald-100">{i.address && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{i.address}{i.city && `, ${i.city}`}</span>}{i.phone && <a href={`tel:${i.phone}`} className="flex items-center gap-1"><Phone className="h-4 w-4" />{i.phone}</a>}</div>
          <div className="urdu mt-3 text-xl">داخلہ فارم · Admission form</div>
        </div>
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          {done ? (
            <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" /><h2 className="mt-3 text-xl font-bold">Request received — شکریہ!</h2><p className="mt-2 text-slate-600">The {i.kind === "tuition" || i.kind === "academy" ? "academy" : "school"} will contact you on {f.phone} soon.</p></div>
          ) : !i.admissions_open ? (
            <div className="py-8 text-center"><h2 className="text-lg font-semibold">Admissions are closed right now</h2><p className="urdu mt-2 text-slate-600">فی الحال داخلے بند ہیں</p>{i.phone && <p className="mt-2 text-slate-600">Please call {i.phone}.</p>}</div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {i.admission_note && <div className="whitespace-pre-line rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2" dir="auto">{i.admission_note}</div>}
              {error && <div className="sm:col-span-2"><ErrorBox message={error} /></div>}
              <Field label="Student name / طالب علم کا نام *"><Input required value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></Field>
              <Field label="Father / guardian name / والد کا نام"><Input value={f.father_name} onChange={(e) => setF({ ...f, father_name: e.target.value })} /></Field>
              <Field label="Phone / WhatsApp *"><Input required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx xxxxxxx" /></Field>
              <Field label="Class wanted / کلاس">{i.classes.length ? <Select value={f.class_wanted} onChange={(e) => setF({ ...f, class_wanted: e.target.value })}><option value="">Choose…</option>{i.classes.map((c) => <option key={c} value={c}>{c}</option>)}</Select> : <Input value={f.class_wanted} onChange={(e) => setF({ ...f, class_wanted: e.target.value })} />}</Field>
              <Field label="Date of birth"><Input type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
              <Field label="Gender"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="male">Boy / لڑکا</option><option value="female">Girl / لڑکی</option></Select></Field>
              <Field label="Previous school" className="sm:col-span-2"><Input value={f.previous_school} onChange={(e) => setF({ ...f, previous_school: e.target.value })} /></Field>
              <Field label="Address / پتہ" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
              <Field label="Anything else?" className="sm:col-span-2"><Textarea rows={3} dir="auto" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
              <Button type="submit" loading={busy} className="sm:col-span-2">Submit / جمع کرائیں</Button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-emerald-200">Powered by DigitalDesk</p>
      </div>
    </div>
  );
}
