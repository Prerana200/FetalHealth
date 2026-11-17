import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../App.jsx";
import { AuthProvider } from "./AuthContext.jsx";

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

// Pretend someone is already signed in. Call this before renderAt.
const seed = (role, name = "tester") =>
  sessionStorage.setItem(
    "fetal-session",
    JSON.stringify({ token: "t", user: { id: "u1", name, role } })
  );

const heading = (name) => screen.findByRole("heading", { name });

describe("sign-in and route guards", () => {
  it("sends signed-out visitors to the sign-in page", async () => {
    renderAt("/patient");
    expect(await heading(/^sign in$/i)).toBeInTheDocument();
  });

  it("requires an email and password", async () => {
    renderAt("/login");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your email and password/i);
  });

  it("signs a patient in and lands on their scans", async () => {
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "anna@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await heading(/my scans/i)).toBeInTheDocument();
  });

  it("signs a doctor in and lands on the review dashboard", async () => {
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "doctor.lee@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await heading(/review dashboard/i)).toBeInTheDocument();
  });

  it("keeps patients off the doctor dashboard", async () => {
    seed("patient");
    renderAt("/doctor");
    expect(await heading(/my scans/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /review dashboard/i })).not.toBeInTheDocument();
  });

  it("keeps doctors off the patient pages", async () => {
    seed("doctor");
    renderAt("/history");
    expect(await heading(/review dashboard/i)).toBeInTheDocument();
  });

  it("signs out", async () => {
    seed("patient", "anna");
    renderAt("/patient");
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("link", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("signs in with the Google demo button", async () => {
    renderAt("/login");
    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(await heading(/my scans/i)).toBeInTheDocument();
  });
});

describe("registration", () => {
  const fill = async (user, { name, email, password, confirm }) => {
    if (name) await user.type(screen.getByLabelText(/full name/i), name);
    if (email) await user.type(screen.getByLabelText(/^email$/i), email);
    if (password) await user.type(screen.getByLabelText(/^password$/i), password);
    if (confirm) await user.type(screen.getByLabelText(/confirm password/i), confirm);
    await user.click(screen.getByRole("button", { name: /^create account$/i }));
  };

  it("checks each field and shows the first problem", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    await user.click(screen.getByRole("button", { name: /^create account$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your name/i);
  });

  it("rejects a bad email, a short password and mismatched passwords", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    await fill(user, { name: "Anna", email: "abc" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    await user.clear(screen.getByLabelText(/^email$/i));
    await fill(user, { email: "anna@example.com", password: "short" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    await user.clear(screen.getByLabelText(/^password$/i));
    await fill(user, { password: "password1", confirm: "password2" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
  });

  it("creates a patient account and signs in", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    await fill(user, {
      name: "Anna",
      email: "anna@example.com",
      password: "password1",
      confirm: "password1",
    });
    expect(await heading(/my scans/i)).toBeInTheDocument();
  });
});

describe("report history", () => {
  it("lists the sample reports and filters by review status", async () => {
    seed("patient");
    renderAt("/history");
    const links = await screen.findAllByRole("link", { name: /view report/i });
    expect(links).toHaveLength(6);
    await userEvent.selectOptions(screen.getByLabelText(/review status/i), "pending");
    expect(screen.getByText(/showing 4 of 6 reports/i)).toBeInTheDocument();
  });

  it("opens a full report from the history", async () => {
    seed("patient");
    renderAt("/history");
    const [first] = await screen.findAllByRole("link", { name: /view report/i });
    await userEvent.click(first);
        expect(await heading(/scan report/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /print/i })).toBeInTheDocument();
  });
});