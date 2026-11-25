import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { BRAND } from "./lib/brand";
import { useAuth } from "./contexts/AuthContext";
import { MembershipProvider, useMemberships } from "./contexts/InstituteContext";
import { supabaseConfigured } from "./lib/supabase";
import { Spinner } from "./components/ui";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import NewInstitute from "./pages/NewInstitute";
import PlatformAdmin from "./pages/PlatformAdmin";
import Apply from "./pages/public/Apply";
import Portal from "./pages/public/Portal";
import Dashboard from "./pages/app/Dashboard";
import Students from "./pages/app/Students";
import StudentProfile from "./pages/app/StudentProfile";
import Admissions from "./pages/app/Admissions";
import Attendance from "./pages/app/Attendance";
import Fees from "./pages/app/Fees";
import Exams from "./pages/app/Exams";
import Classes from "./pages/app/Classes";
import StaffPage from "./pages/app/Staff";
import Expenses from "./pages/app/Expenses";
import Notices from "./pages/app/Notices";
import Reports from "./pages/app/Reports";
import Team from "./pages/app/Team";
import SettingsPage from "./pages/app/Settings";
import Billing from "./pages/app/Billing";

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <MembershipProvider><Outlet /></MembershipProvider>;
}

function AppHome() {
  const { memberships, loading, error, reload } = useMemberships();
  if (loading) return <Spinner />;
  if (error) return <div className="p-8 text-center text-red-600">{error} <button className="underline" onClick={reload}>Retry</button></div>;
  if (!memberships.length) return <Navigate to="/app/new" replace />;
  let last: string | null = null;
  try { last = localStorage.getItem("bh.lastInstitute"); } catch { /* storage unavailable */ }
  const target = memberships.find((m) => m.institute.id === last) ?? memberships[0];
  return <Navigate to={`/app/${target.institute.id}`} replace />;
}

export default function App() {
  if (!supabaseConfigured) return <div className="mx-auto max-w-xl p-10"><h1 className="text-xl font-bold">{BRAND.name} is not connected to Supabase yet</h1><p className="mt-3 text-slate-600">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).</p></div>;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/apply/:slug" element={<Apply />} />
      <Route path="/portal/:slug" element={<Portal />} />
      <Route path="/app" element={<RequireAuth />}>
        <Route index element={<AppHome />} />
        <Route path="new" element={<NewInstitute />} />
        <Route path="admin" element={<PlatformAdmin />} />
        <Route path=":instituteId" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:studentId" element={<StudentProfile />} />
          <Route path="admissions" element={<Admissions />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="fees" element={<Fees />} />
          <Route path="exams" element={<Exams />} />
          <Route path="classes" element={<Classes />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="notices" element={<Notices />} />
          <Route path="reports" element={<Reports />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="billing" element={<Billing />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
