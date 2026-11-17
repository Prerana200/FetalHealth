import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  googleLogin as apiGoogle,
  setToken,
  onUnauthorized,
} from "../api/client.js";

const KEY = "fetal-session";
const AuthContext = createContext(null);

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
function writeSession(session) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the user just won't stay signed in after a reload
  }
}

export const roleHome = (role) =>
  role === "patient" ? "/patient" : role === "admin" ? "/admin" : "/doctor";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const s = readSession();
    setToken(s?.token ?? null);
    return s;
  });

  const logout = useCallback(() => {
    setToken(null);
    writeSession(null);
    setSession(null);
  }, []);

  // Shared by every sign-in method: store the token and user.
  const start = useCallback(({ access_token, user }) => {
    setToken(access_token);
    const s = { token: access_token, user };
    writeSession(s);
    setSession(s);
    return user;
  }, []);

  const login = useCallback(async (email, password) => start(await apiLogin(email, password)), [start]);
  const register = useCallback(
    async (name, email, password) => start(await apiRegister(name, email, password)),
    [start]
  );
  const loginWithGoogle = useCallback(
    async (credential) => start(await apiGoogle(credential)),
    [start]
  );

  useEffect(() => onUnauthorized(logout), [logout]);

  const value = useMemo(
    () => ({ user: session?.user ?? null, login, register, loginWithGoogle, logout }),
    [session, login, register, loginWithGoogle, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);