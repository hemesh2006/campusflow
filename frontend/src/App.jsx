import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ROLES } from "./data/mockData";
import { roleHome } from "./routes";

import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import NotFound from "./pages/NotFound";

import StudentDashboard from "./pages/dashboards/StudentDashboard";
import StudentTasks from "./pages/dashboards/StudentTasks";
import StudentGroup from "./pages/dashboards/StudentGroup";
import StudentPlacements from "./pages/dashboards/StudentPlacements";
import StudentSkills from "./pages/dashboards/StudentSkills";
import StudentProfile from "./pages/dashboards/StudentProfile";
import MyMessages from "./pages/dashboards/MyMessages";

import AdvisorDashboard from "./pages/dashboards/AdvisorDashboard";
import AdvisorStudents from "./pages/dashboards/AdvisorStudents";
import AdvisorPlacements from "./pages/dashboards/AdvisorPlacements";
import AdvisorGroup from "./pages/dashboards/AdvisorGroup";

import HodDashboard from "./pages/dashboards/HodDashboard";
import HodAdvisorGroup from "./pages/dashboards/HodAdvisorGroup";

import PrincipalDashboard from "./pages/dashboards/PrincipalDashboard";
import PrincipalDepartments from "./pages/dashboards/PrincipalDepartments";
import PrincipalHodGroup from "./pages/dashboards/PrincipalHodGroup";

import AdminDashboard from "./pages/dashboards/AdminDashboard";
import AdminUsers from "./pages/dashboards/AdminUsers";
import AdminReports from "./pages/dashboards/AdminReports";
import AdminDirectMessage from "./pages/dashboards/AdminDirectMessage";
import AgentManagerSettings from "./pages/dashboards/AgentManagerSettings";
import NetworkView from "./pages/dashboards/NetworkView";
import AccountNotifications from "./pages/dashboards/AccountNotifications";

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return <Navigate to={user ? roleHome(user.role) : "/login"} replace />;
}

function FullScreenLoader() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--text-lo)", fontSize: 13 }}>
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/student" element={<Protected role={ROLES.STUDENT}><StudentDashboard /></Protected>} />
          <Route path="/student/tasks" element={<Protected role={ROLES.STUDENT}><StudentTasks /></Protected>} />
          <Route path="/student/placements" element={<Protected role={ROLES.STUDENT}><StudentPlacements /></Protected>} />
          <Route path="/student/skills" element={<Protected role={ROLES.STUDENT}><StudentSkills /></Protected>} />
          <Route path="/student/group" element={<Protected role={ROLES.STUDENT}><StudentGroup /></Protected>} />
          <Route path="/student/profile" element={<Protected role={ROLES.STUDENT}><StudentProfile /></Protected>} />
          <Route path="/student/messages" element={<Protected role={ROLES.STUDENT}><MyMessages /></Protected>} />

          <Route path="/advisor" element={<Protected role={ROLES.ADVISOR}><AdvisorDashboard /></Protected>} />
          <Route path="/advisor/students" element={<Protected role={ROLES.ADVISOR}><AdvisorStudents /></Protected>} />
          <Route path="/advisor/placements" element={<Protected role={ROLES.ADVISOR}><AdvisorPlacements /></Protected>} />
          <Route path="/advisor/network" element={<Protected role={ROLES.ADVISOR}><NetworkView scopeLabel="Class · CSE-C" /></Protected>} />
          <Route path="/advisor/group" element={<Protected role={ROLES.ADVISOR}><AdvisorGroup /></Protected>} />
          <Route path="/advisor/messages" element={<Protected role={ROLES.ADVISOR}><MyMessages /></Protected>} />
          <Route path="/advisor/notifications" element={<Protected role={ROLES.ADVISOR}><AccountNotifications /></Protected>} />

          <Route path="/hod" element={<Protected role={ROLES.HOD}><HodDashboard /></Protected>} />
          <Route path="/hod/network" element={<Protected role={ROLES.HOD}><NetworkView scopeLabel="Department · AI & DS" /></Protected>} />
          <Route path="/hod/group" element={<Protected role={ROLES.HOD}><HodAdvisorGroup /></Protected>} />
          <Route path="/hod/messages" element={<Protected role={ROLES.HOD}><MyMessages /></Protected>} />
          <Route path="/hod/notifications" element={<Protected role={ROLES.HOD}><AccountNotifications /></Protected>} />

          <Route path="/principal" element={<Protected role={ROLES.PRINCIPAL}><PrincipalDashboard /></Protected>} />
          <Route path="/principal/departments" element={<Protected role={ROLES.PRINCIPAL}><PrincipalDepartments /></Protected>} />
          <Route path="/principal/group" element={<Protected role={ROLES.PRINCIPAL}><PrincipalHodGroup /></Protected>} />
          <Route path="/principal/messages" element={<Protected role={ROLES.PRINCIPAL}><MyMessages /></Protected>} />
          <Route path="/principal/notifications" element={<Protected role={ROLES.PRINCIPAL}><AccountNotifications /></Protected>} />

          <Route path="/admin" element={<Protected role={ROLES.ADMIN}><AdminDashboard /></Protected>} />
          <Route path="/admin/network" element={<Protected role={ROLES.ADMIN}><NetworkView scopeLabel="Institution — full access" /></Protected>} />
          <Route path="/admin/agent-manager" element={<Protected role={ROLES.ADMIN}><AgentManagerSettings /></Protected>} />
          <Route path="/admin/users" element={<Protected role={ROLES.ADMIN}><AdminUsers /></Protected>} />
          <Route path="/admin/message" element={<Protected role={ROLES.ADMIN}><AdminDirectMessage /></Protected>} />
          <Route path="/admin/reports" element={<Protected role={ROLES.ADMIN}><AdminReports /></Protected>} />
          <Route path="/admin/notifications" element={<Protected role={ROLES.ADMIN}><AccountNotifications /></Protected>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
