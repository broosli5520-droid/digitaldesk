import { useState } from "react";
import { Copy, Megaphone, Plus, Trash2 } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { dateTime } from "../../lib/format";
import { words } from "../../lib/words";
import { canEdit } from "../../lib/permissions";
import { className, type Notice } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, confirmAction, useToast } from "../../components/ui";

export default function Notices() {
  const { institute, role } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const edit = canEdit(role, "notices");
  const classes = useClasses(institute.id);
  const list = useAsync(async () => must(await supabase.from("notices").select("*").eq("institute_id", institute.id).order("created_at", { ascending: false }).limit(100)) as Notice[], [institute.id]);
  const [form, setForm] = useState<{ title: string; body: string; class_id: string } | null>(null);
  async function save() {
    if (!form?.title.trim()) return;
    const { error } = await supabase.from("notices").insert({ institute_id: institute.id, title: form.title.trim(), body: form.body, class_id: form.class_id || null });
    if (error) toast("error", errorMessage(error)); else { setForm(null); void list.reload(); toast("success", "Posted — parents see it in the portal"); }
  }
  async function remove(n: Notice) {
    if (!confirmAction("Delete this notice?")) return;
    const { error } = await supabase.from("notices").delete().eq("id", n.id);
    if (error) toast("error", errorMessage(error)); else void list.reload();
  }
  const share = (n: Notice) => { void navigator.clipboard?.writeText(`📢 ${institute.name}\n*${n.title}*\n${n.body}`); toast("success", "Copied — paste it in your parents' WhatsApp group"); };
  return (
    <div>
      <PageHeader title="Notices" subtitle="Holidays, meetings, exam dates — shown in the parent portal and easy to paste into WhatsApp groups."
        actions={edit && <Button onClick={() => setForm({ title: "", body: "", class_id: "" })}><Plus className="h-4 w-4" />New notice</Button>} />
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data?.length ? <Card><Empty icon={<Megaphone className="h-6 w-6" />} title="No notices yet" /></Card> : (
        <div className="space-y-3">{list.data.map((n) => (
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="font-semibold">{n.title}</div><div className="text-xs text-slate-500">{dateTime(n.created_at)} · {n.class_id ? <Badge>{className(classes.data?.find((c) => c.id === n.class_id))}</Badge> : "Everyone"}</div></div>
              <div className="flex shrink-0 gap-1"><Button variant="ghost" onClick={() => share(n)} title="Copy for WhatsApp"><Copy className="h-4 w-4" /></Button>{edit && <Button variant="ghost" onClick={() => remove(n)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div>
            </div>
            {n.body && <p className="urdu-aware mt-2 whitespace-pre-line text-sm text-slate-700" dir="auto">{n.body}</p>}
          </Card>))}</div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="New notice" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Post</Button></>}>
        {form && <div className="grid gap-4">
          <Field label="Title"><Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Parent-teacher meeting on Saturday" /></Field>
          <Field label="Details (Urdu or English)"><Textarea dir="auto" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="For"><Select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}><option value="">Everyone</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>Only {className(c)}</option>)}</Select></Field>
          <p className="text-xs text-slate-500">Tip: a {w.klass.toLowerCase()}-only notice appears only to parents of that {w.klass.toLowerCase()}.</p>
        </div>}
      </Modal>
    </div>
  );
}
