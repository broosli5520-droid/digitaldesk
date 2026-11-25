import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, errorMessage } from "../lib/supabase";
import { slugify } from "../lib/format";
import { useMemberships } from "../contexts/InstituteContext";
import { Button, ErrorBox, Field, Input, Select } from "../components/ui";
import { Logo } from "../components/Layout";

const KINDS = [
  { id: "school", label: "School" }, { id: "tuition", label: "Tuition centre" }, { id: "academy", label: "Academy / coaching" },
  { id: "madrasa", label: "Madrasa / Quran centre" }, { id: "college", label: "College" },
];

export default function NewInstitute() {
  const navigate = useNavigate();
  const { reload } = useMemberships();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState("school");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc("create_institute", { p_name: name, p_slug: slug || slugify(name), p_kind: kind, p_phone: phone, p_city: city });
    setBusy(false);
    if (error) { setError(errorMessage(error)); return; }
    await reload();
    navigate(`/app/${data as string}/classes`, { replace: true });
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">Set up your institute</h1>
        <p className="mt-1 text-sm text-slate-500">Takes one minute. You can change everything later in Settings.</p>
        <div className="mt-6 space-y-4">
          {error && <ErrorBox message={error} />}
          <Field label="Institute name"><Input required minLength={2} value={name} placeholder="e.g. Al-Noor Public School" onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} /></Field>
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></Field>
          <Field label="Link name" hint={`Admission form: ${window.location.origin}/apply/${slug || "your-name"}`}>
            <Input required pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone / WhatsApp"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" /></Field>
            <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" /></Field>
          </div>
          <Button type="submit" loading={busy} className="w-full">Create institute</Button>
        </div>
      </form>
    </div>
  );
}
