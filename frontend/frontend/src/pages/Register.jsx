import GoogleButton from "../components/GoogleButton.jsx";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../auth/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Returns an error message, or null if the form is fine.
  const validate = () => {
    if (!form.name.trim()) return "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirm) return "The passwords do not match.";
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;

    setBusy(true);
    try {
      const user = await register(form.name.trim(), form.email.trim(), form.password);
      nav(roleHome(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="panel narrow" onSubmit={submit} noValidate>
      <h1>Create account</h1>
      <label>
        Full name
        <input autoComplete="name" value={form.name} onChange={set("name")} />
      </label>
      <label>
        Email
        <input type="email" autoComplete="username" value={form.email} onChange={set("email")} />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
        />
      </label>
      <p className="hint">At least 8 characters. Accounts created here are patient accounts.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="or">or</p>
      <GoogleButton onError={setError} />

      <p className="hint">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}