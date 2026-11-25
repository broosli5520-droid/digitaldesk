import { useState } from "react";
import { BookText, Layers, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { useAsync, must } from "../../lib/useAsync";
import { useClasses } from "../../lib/data";
import { money } from "../../lib/format";
import { words } from "../../lib/words";
import { canEdit } from "../../lib/permissions";
import type { ClassRow, Subject } from "../../lib/types";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, confirmAction, useToast } from "../../components/ui";

const PRESETS: Record<string, string[]> = {
  school: ["Playgroup", "Nursery", "Prep", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"],
  madrasa: ["Qaida", "Nazra", "Hifz", "Tajweed", "Dars-e-Nizami (Oola)"],
  tuition: ["Class 5–8 (Evening)", "Matric Science", "Matric Arts", "FSc Pre-Medical", "FSc Pre-Engineering"],
  academy: ["Matric", "FSc / ICS", "Entry test (MDCAT/ECAT)", "Spoken English", "Computer course"],
  college: ["1st Year", "2nd Year", "BA / BSc Part 1", "BA / BSc Part 2"],
};
const SUBJECTS = ["English", "Urdu", "Maths", "Science", "Islamiyat", "Social Studies", "Computer"];

export default function Classes() {
  const { institute, role } = useInstitute();
  const toast = useToast();
  const w = words(institute.kind);
  const edit = canEdit(role, "classes");
  const classes = useClasses(institute.id);
  const [form, setForm] = useState<Partial<ClassRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const subjects = useAsync(async () => (selected ? (must(await supabase.from("subjects").select("*").eq("class_id", selected).order("sort").order("name")) as Subject[]) : []), [selected]);
  const [newSubject, setNewSubject] = useState({ name: "", max_marks: "100" });

  async function save() {
    if (!form?.name?.trim()) return;
    setSaving(true);
    const row = { institute_id: institute.id, name: form.name.trim(), section: form.section?.trim() ?? "", monthly_fee: Number(form.monthly_fee ?? 0), timing: form.timing?.trim() ?? "", sort: Number(form.sort ?? 0), active: form.active ?? true };
    const { error } = form.id ? await supabase.from("classes").update(row).eq("id", form.id) : await supabase.from("classes").insert(row);
    setSaving(false);
    if (error) { toast("error", errorMessage(error)); return; }
    setForm(null); void classes.reload(); toast("success", "Saved");
  }
  async function preset() {
    const names = PRESETS[institute.kind] ?? PRESETS.school;
    const { error } = await supabase.from("classes").insert(names.map((name, i) => ({ institute_id: institute.id, name, sort: i + 1 })));
    if (error) toast("error", errorMessage(error)); else { toast("success", `${names.length} ${w.klasses.toLowerCase()} added — now set each fee`); void classes.reload(); }
  }
  async function remove(c: ClassRow) {
    if (!confirmAction(`Delete ${c.name}? Its subjects and exams are deleted too. Students stay but lose their ${w.klass.toLowerCase()}.`)) return;
    const { error } = await supabase.from("classes").delete().eq("id", c.id);
    if (error) toast("error", errorMessage(error)); else { if (selected === c.id) setSelected(null); void classes.reload(); }
  }
  async function addSubject(names?: string[]) {
    if (!selected) return;
    const list = names ?? [newSubject.name.trim()].filter(Boolean);
    if (!list.length) return;
    const { error } = await supabase.from("subjects").insert(list.map((name, i) => ({ institute_id: institute.id, class_id: selected, name, max_marks: Number(newSubject.max_marks) || 100, sort: (subjects.data?.length ?? 0) + i })));
    if (error) toast("error", errorMessage(error)); else { setNewSubject({ name: "", max_marks: newSubject.max_marks }); void subjects.reload(); }
  }
  async function updateSubject(s: Subject, patch: Partial<Subject>) {
    const { error } = await supabase.from("subjects").update(patch).eq("id", s.id);
    if (error) toast("error", errorMessage(error)); else void subjects.reload();
  }
  async function removeSubject(s: Subject) {
    if (!confirmAction(`Delete subject ${s.name}? Marks entered for it are deleted too.`)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", s.id);
    if (error) toast("error", errorMessage(error)); else void subjects.reload();
  }

  const sel = classes.data?.find((c) => c.id === selected);
  return (
    <div>
      <PageHeader title={`${w.klasses} & Subjects`} subtitle={`Set the monthly fee of each ${w.klass.toLowerCase()} — fee invoices use it automatically.`}
        actions={edit && <Button onClick={() => setForm({ active: true, monthly_fee: 0 })}><Plus className="h-4 w-4" />Add {w.klass.toLowerCase()}</Button>} />
      {classes.loading ? <Spinner /> : classes.error ? <ErrorBox message={classes.error} onRetry={classes.reload} /> : !classes.data?.length ? (
        <Card><Empty icon={<Layers className="h-6 w-6" />} title={`No ${w.klasses.toLowerCase()} yet`} text="Add them one by one, or start with a ready-made list you can edit."
          action={edit && <Button onClick={preset}><Wand2 className="h-4 w-4" />Add a ready-made list</Button>} /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="divide-y lg:col-span-3">
            {classes.data.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${selected === c.id ? "bg-emerald-50" : ""}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(c.id)}>
                  <div className="font-medium">{c.name}{c.section && ` — ${c.section}`} {!c.active && <Badge>Inactive</Badge>}</div>
                  <div className="text-xs text-slate-500">{money(c.monthly_fee, institute.currency)} / month{c.timing && ` · ${c.timing}`}</div>
                </button>
                <Button variant="ghost" onClick={() => setSelected(c.id)} title="Subjects"><BookText className="h-4 w-4" /></Button>
                {edit && <Button variant="ghost" onClick={() => setForm(c)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}
                {edit && <Button variant="ghost" onClick={() => remove(c)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
              </div>
            ))}
          </Card>
          <Card className="p-4 lg:col-span-2">
            {!sel ? <p className="text-sm text-slate-500">Select a {w.klass.toLowerCase()} to manage its subjects (used for marks and report cards).</p> : (
              <div>
                <h2 className="font-semibold">Subjects — {sel.name}{sel.section && ` ${sel.section}`}</h2>
                {subjects.loading ? <Spinner /> : (
                  <div className="mt-3 space-y-2">
                    {subjects.data?.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Input defaultValue={s.name} disabled={!edit} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && updateSubject(s, { name: e.target.value.trim() })} />
                        <Input className="w-24" type="number" min={1} defaultValue={s.max_marks} disabled={!edit} title="Total marks" onBlur={(e) => Number(e.target.value) !== Number(s.max_marks) && updateSubject(s, { max_marks: Number(e.target.value) || 100 })} />
                        {edit && <Button variant="ghost" onClick={() => removeSubject(s)} aria-label="Delete subject"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                      </div>
                    ))}
                    {!subjects.data?.length && edit && <Button variant="secondary" onClick={() => addSubject(SUBJECTS)}><Wand2 className="h-4 w-4" />Add common subjects</Button>}
                    {edit && (
                      <div className="flex items-center gap-2 border-t pt-3">
                        <Input placeholder="New subject" value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
                        <Input className="w-24" type="number" value={newSubject.max_marks} onChange={(e) => setNewSubject({ ...newSubject, max_marks: e.target.value })} title="Total marks" />
                        <Button onClick={() => addSubject()}><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${w.klass.toLowerCase()}` : `New ${w.klass.toLowerCase()}`}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input autoFocus value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={institute.kind === "tuition" ? "Matric Science" : "Class 5"} /></Field>
            <Field label="Section (optional)"><Input value={form.section ?? ""} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A / Boys / Morning" /></Field>
            <Field label="Monthly fee"><Input type="number" min={0} value={form.monthly_fee ?? 0} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} /></Field>
            <Field label="Timing (optional)"><Input value={form.timing ?? ""} onChange={(e) => setForm({ ...form, timing: e.target.value })} placeholder="4:00–6:00 pm" /></Field>
            <Field label="Order in lists"><Input type="number" value={form.sort ?? 0} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
