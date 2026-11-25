import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { supabase, errorMessage } from "../../lib/supabase";
import { must, useAsync } from "../../lib/useAsync";
import { roleLabel } from "../../lib/permissions";
import type { Role } from "../../lib/types";
import { useAuth } from "../../contexts/AuthContext";
import { useInstitute } from "../../contexts/InstituteContext";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table, confirmAction, td, th, useToast } from "../../components/ui";

interface Row { user_id: string | null; email: string; full_name: string; role: Role; pending: boolean }
const HELP: Record<string, string> = {
  admin: "Everything except billing ownership", accountant: "Fees, receipts, expenses, salaries", teacher: "Attendance, marks & report cards",
};

export default function Team() {
  const { institute, role } = useInstitute();
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(async () => must(await supabase.rpc("team_list", { p_inst: institute.id })) as Row[], [institute.id]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("teacher");
  const [busy, setBusy] = useState(false);
  async function invite() {
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("invite_member", { p_inst: institute.id, p_email: email.trim(), p_role: newRole });
    setBusy(false);
    if (error) { toast("error", errorMessage(error)); return; }
    toast("success", data === "added" ? "Added — they can sign in now" : `Invited — ask them to register at ${window.location.origin} with ${email.trim()}`);
    setEmail(""); void list.reload();
  }
  async function remove(r: Row) {
    if (!confirmAction(`Remove ${r.email}?`)) return;
    const { error } = r.pending ? await supabase.from("invitations").delete().eq("institute_id", institute.id).eq("email", r.email) : await supabase.rpc("remove_member", { p_inst: institute.id, p_user: r.user_id });
    if (error) toast("error", errorMessage(error)); else void list.reload();
  }
  async function changeRole(r: Row, to: string) {
    const { error } = await supabase.from("institute_members").update({ role: to }).eq("institute_id", institute.id).eq("user_id", r.user_id!);
    if (error) toast("error", errorMessage(error)); else void list.reload();
  }
  return (
    <div>
      <PageHeader title="Team & Roles" subtitle="Give each teacher and accountant their own login — they only see what their role needs." />
      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@gmail.com" /></Field>
          <Field label="Role"><Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>{role === "owner" && <option value="admin">Admin</option>}<option value="accountant">Accountant</option><option value="teacher">Teacher</option></Select></Field>
          <Button loading={busy} onClick={invite}><UserPlus className="h-4 w-4" />Add</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{HELP[newRole]}. If they don't have an account yet, they just register with this email and get access automatically.</p>
      </Card>
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : (
        <Card><Table><thead><tr><th className={th}>Person</th><th className={th}>Role</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{list.data?.map((r) => (
            <tr key={r.email}><td className={td}><div className="font-medium">{r.full_name || r.email}</div><div className="text-xs text-slate-500">{r.email} {r.pending && <Badge color="amber">Invited</Badge>}</div></td>
              <td className={td}>{r.role === "owner" || r.pending || role !== "owner" || r.user_id === user?.id ? <Badge color={r.role === "owner" ? "purple" : "gray"}>{roleLabel[r.role]}</Badge>
                : <Select className="w-40" value={r.role} onChange={(e) => changeRole(r, e.target.value)}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="teacher">Teacher</option></Select>}</td>
              <td className={`${td} text-right`}>{r.role !== "owner" && r.user_id !== user?.id && <Button variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</td></tr>))}</tbody></Table></Card>
      )}
    </div>
  );
}
