import { useEffect, useState } from "react";
import { listUsers, createUser, updateUser, ROLES } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const EMPTY = { name: "", email: "", password: "", role: "doctor" };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => {
        setError(e.message);
        setUsers([]);
      });
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Returns an error message, or null if the form is fine.
  const validate = () => {
    if (!form.name.trim()) return "Enter the user's name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (form.password.length < 8) return "The temporary password must be at least 8 characters.";
    return null;
  };

  const create = async (e) => {
    e.preventDefault();
    setMessage(null);
    const problem = validate();
    setError(problem);
    if (problem) return;

    setBusy(true);
    try {
      const u = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      setUsers((prev) => [...prev, u]);
      setForm(EMPTY);
      setMessage(`Created ${u.role} account for ${u.name}. Share the temporary password with them securely.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Saves a change, then swaps the updated user into the list.
  const change = async (u, changes, okText) => {
    setError(null);
    setMessage(null);
    try {
      const updated = await updateUser(u.id, changes);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      setMessage(okText);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1>User management</h1>

      <form className="panel" onSubmit={create} noValidate>
        <h2>Create a user</h2>
        <div className="grid-form">
          <label>
            Full name
            <input value={form.name} onChange={set("name")} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={set("email")} />
          </label>
          <label>
            Temporary password
            <input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={set("role")}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </form>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}

      {users === null ? (
        <p className="empty">Loading users…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id; // admins cannot change their own account
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={self}
                        onChange={(e) => change(u, { role: e.target.value }, `Role updated for ${u.name}.`)}
                      >
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.active ? "ok" : "bad"}`}>
                        {u.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn ghost sm"
                        disabled={self}
                        onClick={() =>
                          change(
                            u,
                            { active: !u.active },
                            `${u.name} was ${u.active ? "deactivated" : "reactivated"}.`
                          )
                        }
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}