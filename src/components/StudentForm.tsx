import { useState } from "react";
import { supabase, errorMessage } from "../lib/supabase";
import type { ClassRow, Student } from "../lib/types";
import { className } from "../lib/types";
import { today } from "../lib/words";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "./ui";

export type StudentDraft = Partial<Student>;

/** Add / edit a student. Used by Students, the student profile and accepted admission requests. */
export default function StudentForm({ instituteId, classes, initial, klass, onClose, onSaved }:
  { instituteId: string; classes: ClassRow[]; initial: StudentDraft; klass: string; onClose: () => void; onSaved: (s: Student) => void }) {
  const toast = useToast();
  const [f, setF] = useState<StudentDraft>({ status: "active", gender: "", discount: 0, admission_date: today(), ...initial });
  const [saving, setSaving] = useState(false);
  const set = (patch: StudentDraft) => setF((x) => ({ ...x, ...patch }));
  const cls = classes.find((c) => c.id === f.class_id);

  async function save() {
    if (!f.name?.trim()) { toast("error", "Student name is required"); return; }
    setSaving(true);
    const row = {
      institute_id: instituteId, name: f.name.trim(), father_name: f.father_name?.trim() ?? "", gender: f.gender ?? "", dob: f.dob || null,
      phone: f.phone?.trim() ?? "", phone2: f.phone2?.trim() ?? "", address: f.address?.trim() ?? "", class_id: f.class_id || null, roll_no: f.roll_no?.trim() ?? "",
      admission_date: f.admission_date || today(), monthly_fee: f.monthly_fee === null || f.monthly_fee === undefined || (f.monthly_fee as unknown) === "" ? null : Number(f.monthly_fee),
      discount: Number(f.discount ?? 0), family_code: f.family_code?.trim() ?? "", status: f.status ?? "active",
      left_on: f.status !== "active" ? f.left_on || today() : null, notes: f.notes ?? "",
      ...(f.admission_no ? { admission_no: Number(f.admission_no) } : {}),
    };
    const res = f.id ? await supabase.from("students").update(row).eq("id", f.id).select().single() : await supabase.from("students").insert(row).select().single();
    setSaving(false);
    if (res.error) { toast("error", /admission_no/.test(res.error.message) ? "That admission number is already used." : errorMessage(res.error)); return; }
    toast("success", f.id ? "Student updated" : `Student added — admission no. ${(res.data as Student).admission_no}`);
    onSaved(res.data as Student);
  }

  return (
    <Modal open onClose={onClose} wide title={f.id ? `Edit ${f.name}` : "New student"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Student name *"><Input autoFocus value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Father / guardian name"><Input value={f.father_name ?? ""} onChange={(e) => set({ father_name: e.target.value })} /></Field>
        <Field label="Gender"><Select value={f.gender ?? ""} onChange={(e) => set({ gender: e.target.value as Student["gender"] })}><option value="">—</option><option value="male">Boy</option><option value="female">Girl</option></Select></Field>
        <Field label={klass}><Select value={f.class_id ?? ""} onChange={(e) => set({ class_id: e.target.value || null })}><option value="">— none —</option>{classes.filter((c) => c.active || c.id === f.class_id).map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></Field>
        <Field label="Roll no."><Input value={f.roll_no ?? ""} onChange={(e) => set({ roll_no: e.target.value })} /></Field>
        <Field label="Admission no." hint={f.id ? undefined : "Leave empty for the next number"}><Input type="number" min={1} value={f.admission_no ?? ""} onChange={(e) => set({ admission_no: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Guardian phone (WhatsApp)"><Input inputMode="tel" value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="03xx xxxxxxx" /></Field>
        <Field label="Second phone"><Input inputMode="tel" value={f.phone2 ?? ""} onChange={(e) => set({ phone2: e.target.value })} /></Field>
        <Field label="Date of birth"><Input type="date" value={f.dob ?? ""} onChange={(e) => set({ dob: e.target.value || null })} /></Field>
        <Field label="Monthly fee" hint={cls ? `Empty = ${klass.toLowerCase()} fee (${cls.monthly_fee})` : "Empty = class fee"}>
          <Input type="number" min={0} value={f.monthly_fee ?? ""} onChange={(e) => set({ monthly_fee: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Monthly concession" hint="Discount / scholarship per month"><Input type="number" min={0} value={f.discount ?? 0} onChange={(e) => set({ discount: Number(e.target.value) })} /></Field>
        <Field label="Family code" hint="Same code for brothers & sisters"><Input value={f.family_code ?? ""} onChange={(e) => set({ family_code: e.target.value })} placeholder="e.g. AHMED-1" /></Field>
        <Field label="Admission date"><Input type="date" value={f.admission_date ?? ""} onChange={(e) => set({ admission_date: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status ?? "active"} onChange={(e) => set({ status: e.target.value as Student["status"] })}><option value="active">Studying</option><option value="left">Left</option><option value="graduated">Passed out</option></Select></Field>
        {f.status !== "active" && <Field label="Left on"><Input type="date" value={f.left_on ?? today()} onChange={(e) => set({ left_on: e.target.value })} /></Field>}
        <Field label="Address" className="sm:col-span-3"><Input value={f.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-3"><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
