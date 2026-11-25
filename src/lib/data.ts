import { supabase } from "./supabase";
import { must, useAsync } from "./useAsync";
import type { ClassRow, Student, Subject } from "./types";

/** Classes (or batches) of the institute, in display order. */
export function useClasses(instituteId: string) {
  return useAsync(async () => must(await supabase.from("classes").select("*").eq("institute_id", instituteId).order("sort").order("name")) as ClassRow[], [instituteId]);
}
export async function loadStudents(instituteId: string, opts: { classId?: string; status?: string } = {}) {
  let q = supabase.from("students").select("*").eq("institute_id", instituteId);
  if (opts.classId) q = q.eq("class_id", opts.classId);
  if (opts.status) q = q.eq("status", opts.status);
  return must(await q.order("roll_no").order("name")) as Student[];
}
export async function loadSubjects(classId: string) {
  return must(await supabase.from("subjects").select("*").eq("class_id", classId).order("sort").order("name")) as Subject[];
}
/** Sort students by roll number naturally ("2" before "10"), then by name. */
export const byRoll = (a: Student, b: Student) => a.roll_no.localeCompare(b.roll_no, undefined, { numeric: true }) || a.name.localeCompare(b.name);
