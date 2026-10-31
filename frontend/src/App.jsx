import { Routes, Route, NavLink, Navigate, useNavigate, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import PatientPortal from "./pages/PatientPortal.jsx";
import ReportHistory from "./pages/ReportHistory.jsx";
import ScanDetail from "./pages/ScanDetail.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import Attribution from "./pages/Attribution.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import { useAuth, roleHome } from "./auth/AuthContext.jsx";

export default function App() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <Link to="/" className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <path d="M16 3 L29 26 A28 28 0 0 1 3 26 Z" fill="currentColor" />
            <circle cx="16" cy="19" r="4" fill="var(--surface)" />
          </svg>
          FetalScan Assist
        </Link>
        <nav aria-label="Main">
          <NavLink to="/">Home</NavLink>
          {user?.role === "patient" && (
            <>
              <NavLink to="/patient">My scans</NavLink>
              <NavLink to="/history">History</NavLink>
            </>
          )}
          {user && user.role !== "patient" && (
            <NavLink to="/doctor">Review dashboard</NavLink>
          )}
          {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
          <NavLink to="/credits">Dataset credits</NavLink>
          {user ? (
            <button
              className="link"
              onClick={() => {
                logout();
                nav("/");
              }}
            >
              Sign out ({user.name})
            </button>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={user ? <Navigate to={roleHome(user.role)} replace /> : <Login />}
          />
          <Route
            path="/register"
            element={user ? <Navigate to={roleHome(user.role)} replace /> : <Register />}
          />
          <Route
            path="/patient"
            element={
              <RequireRole roles={["patient"]}>
                <PatientPortal />
              </RequireRole>
            }
          />
          <Route
            path="/history"
            element={
              <RequireRole roles={["patient"]}>
                <ReportHistory />
              </RequireRole>
            }
          />
          <Route
            path="/scans/:id"
            element={
              <RequireRole roles={["patient", "doctor", "admin"]}>
                <ScanDetail />
              </RequireRole>
            }
          />
          <Route
            path="/doctor"
            element={
              <RequireRole roles={["doctor", "admin"]}>
                <DoctorDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole roles={["admin"]}>
                <AdminUsers />
              </RequireRole>
            }
          />
          <Route path="/credits" element={<Attribution />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="foot">
        <span>Screening support only. Not a diagnosis.</span>
        <Link to="/credits">Dataset credits (CC BY 4.0)</Link>
      </footer>
      {user && <ChatWidget />}
    </>
  );
}