import { useState } from "react";
import { Copy, Inbox, MessageCircle, UserPlus } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { dateTime } from "../../lib/format";
import { waLink } from "../../lib/whatsapp";
import { words } from "../../lib/words";
import type { AdmissionRequest, Student } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Select, Spinner, cx, useToast } from "../../components/ui";
import StudentForm from "../../components/StudentForm";

const colors = { new: "blue", contacted: "amber", accepted: "green", rejected: "gray" } as const;

export default function Admissions() {
  const { institute } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const classes = useClasses(institute.id);
  const [filter, setFilter] = useState("new");
  const list = useAsync(async () => {
    let q = supabase.from("admission_requests").select("*").eq("institute_id", institute.id);
    if (filter) q = q.eq("status", filter);
    return must(await q.order("created_at", { ascending: false })) as AdmissionRequest[];
  }, [institute.id, filter]);
  const [accepting, setAccepting] = useState<AdmissionRequest | null>(null);
  const url = `${window.location.origin}/apply/${institute.slug}`;

  async function setStatus(r: AdmissionRequest, status: AdmissionRequest["status"], student_id?: string) {
    const { error } = await supabase.from("admission_requests").update({ status, ...(student_id ? { student_id } : {}) }).eq("id", r.id);
    if (error) toast("error", errorMessage(error)); else void list.reload();
  }
  const guessClass = (text: string) => classes.data?.find((c) => text && `${c.name} ${c.section}`.toLowerCase().includes(text.toLowerCase().trim()))?.id ?? null;

  return (
    <div>
      <PageHeader title="Admissions" subtitle="Requests from your online admission form" actions={<>
        <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(url); toast("success", "Form link copied — share it on WhatsApp / Facebook"); }}><Copy className="h-4 w-4" />Copy form link</Button>
      </>} />
      {!institute.admissions_open && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Admissions are closed — the form shows a "closed" message. Turn it on in Settings.</div>}
      <div className="mb-4 flex flex-wrap gap-2">{[["new", "New"], ["contacted", "Contacted"], ["accepted", "Admitted"], ["rejected", "Not admitted"], ["", "All"]].map(([k, l]) => (
        <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-4 py-1.5 text-sm font-medium", filter === k ? "bg-emerald-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</button>))}</div>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data?.length ? (
        <Card><Empty icon={<Inbox className="h-6 w-6" />} title="No requests here" text={`Share your admission form link: ${url}`} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-semibold">{r.student_name}</div><div className="text-sm text-slate-500">{r.father_name && `s/o ${r.father_name} · `}{r.class_wanted || "class not given"}</div></div>
                <Badge color={colors[r.status]}>{r.status}</Badge>
              </div>
              <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                <div>📞 {r.phone}</div>
                {r.dob && <div>DOB: {r.dob}</div>}
                {r.previous_school && <div>Previous: {r.previous_school}</div>}
                {r.address && <div>{r.address}</div>}
                {r.message && <div className="rounded bg-slate-50 p-2">{r.message}</div>}
                <div className="text-xs text-slate-400">{dateTime(r.created_at)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={waLink(r.phone, `Assalam-o-Alaikum. ${institute.name} — ${r.student_name} ke dakhle ki darkhwast mili hai. `)} target="_blank" rel="noreferrer" onClick={() => r.status === "new" && setStatus(r, "contacted")}><Button variant="secondary"><MessageCircle className="h-4 w-4" />WhatsApp</Button></a>
                {r.status !== "accepted" && <Button onClick={() => setAccepting(r)}><UserPlus className="h-4 w-4" />Admit</Button>}
                {r.status !== "rejected" && r.status !== "accepted" && <Select className="w-auto" value="" onChange={(e) => e.target.value && setStatus(r, e.target.value as AdmissionRequest["status"])}><option value="">More…</option><option value="contacted">Mark contacted</option><option value="rejected">Not admitted</option></Select>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {accepting && classes.data && <StudentForm instituteId={institute.id} classes={classes.data} klass={w.klass}
        initial={{ name: accepting.student_name, father_name: accepting.father_name, phone: accepting.phone, dob: accepting.dob, gender: accepting.gender as Student["gender"], address: accepting.address, class_id: guessClass(accepting.class_wanted), notes: accepting.previous_school ? `Previous school: ${accepting.previous_school}` : "" }}
        onClose={() => setAccepting(null)} onSaved={(s) => { void setStatus(accepting, "accepted", s.id); setAccepting(null); }} />}
    </div>
  );
}
