import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { login } from "../api/client.js";

const seed = (role, id) =>
  sessionStorage.setItem(
    "fetal-session",
    JSON.stringify({ token: "t", user: { id, name: id.split("@")[0], role } })
  );
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
const asAdmin = () => {
  seed("admin", "admin@example.com");
  renderAt("/admin");
};
// The table row that contains this email address.
const rowFor = async (email) => (await screen.findByText(email)).closest("tr");

describe("admin panel", () => {
  it("lists every user", async () => {
    asAdmin();
    await screen.findByText("ravi@example.com");
    expect(screen.getAllByRole("row")).toHaveLength(6); // header + 5 users
  });

  it("sends an admin to the admin page after sign-in", async () => {
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("heading", { name: /user management/i })).toBeInTheDocument();
  });

  it("keeps non-admins out", async () => {
    seed("doctor", "doctor.lee@example.com");
    renderAt("/admin");
    expect(await screen.findByRole("heading", { name: /review dashboard/i })).toBeInTheDocument();
  });

  it("does not let an admin change their own account", async () => {
    asAdmin();
    const row = await rowFor("admin@example.com");
    expect(within(row).getByRole("button", { name: /deactivate/i })).toBeDisabled();
    expect(within(row).getByRole("combobox")).toBeDisabled();
  });

  it("deactivates and reactivates a user", async () => {
    asAdmin();
    const user = userEvent.setup();
    const row = await rowFor("anna@example.com");
    await user.click(within(row).getByRole("button", { name: /deactivate/i }));
    expect(await within(row).findByRole("button", { name: /reactivate/i })).toBeInTheDocument();
    await expect(login("anna@example.com", "x")).rejects.toThrow(/deactivated/i);
    await user.click(within(row).getByRole("button", { name: /reactivate/i }));
    expect(await within(row).findByRole("button", { name: /^deactivate$/i })).toBeInTheDocument();
  });

  it("blocks sign-in for an already deactivated user", async () => {
    await expect(login("ravi@example.com", "x")).rejects.toThrow(/deactivated/i);
  });

  it("changes a user's role", async () => {
    asAdmin();
    const row = await rowFor("anna@example.com");
    await userEvent.selectOptions(within(row).getByRole("combobox"), "doctor");
    expect(await screen.findByRole("status")).toHaveTextContent(/role updated for anna/i);
  });

  it("creates a doctor account", async () => {
    asAdmin();
    const user = userEvent.setup();
    await screen.findByText("ravi@example.com");
    await user.type(screen.getByLabelText(/full name/i), "Dr Mehta");
    await user.type(screen.getByLabelText(/^email$/i), "mehta@example.com");
    await user.type(screen.getByLabelText(/temporary password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByText("mehta@example.com")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/created doctor account/i);
  });

  it("rejects a duplicate email and a short password", async () => {
    asAdmin();
    const user = userEvent.setup();
    await screen.findByText("ravi@example.com");
    await user.type(screen.getByLabelText(/full name/i), "Someone");
    await user.type(screen.getByLabelText(/^email$/i), "anna@example.com");
    await user.type(screen.getByLabelText(/temporary password/i), "short");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    await user.clear(screen.getByLabelText(/temporary password/i));
    await user.type(screen.getByLabelText(/temporary password/i), "password1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
