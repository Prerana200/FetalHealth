import { Navigate } from "react-router-dom";
import { useAuth, roleHome } from "./AuthContext.jsx";

// Keeps people off pages their role can't use.
// This is only a convenience: the backend must still enforce access on every request.
export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}