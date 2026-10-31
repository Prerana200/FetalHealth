import { Link } from "react-router-dom";
import { useAuth, roleHome } from "../auth/AuthContext.jsx";

const icon = (children) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const FEATURES = [
  {
    title: "Upload and analyse",
    text: "Drop in an anonymised ultrasound image and get the predicted scan plane with a probability for every class.",
    icon: icon(<path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" />),
  },
  {
    title: "See where the model looked",
    text: "An optional heatmap shows which areas the model focused on, so results are easier to question and discuss.",
    icon: icon(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  },
  {
    title: "Doctor review",
    text: "Every prediction can be confirmed or disputed by a clinician, and the outcome is kept in your report history.",
    icon: icon(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>),
  },
];

const STEPS = [
  ["Upload", "Choose a JPEG or PNG ultrasound image, up to 10 MB."],
  ["Analyse", "The hybrid classical and quantum model predicts the scan plane and its confidence."],
  ["Review", "A doctor checks the result. You can print or save the report."],
];

function ScanArt() {
  return (
    <svg viewBox="0 0 320 290" role="img" aria-label="Illustration of an ultrasound scan sector" className="art">
      <defs>
        <linearGradient id="fan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
        <radialGradient id="heat" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff7a2f" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffbe2f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M160 20 L300 230 A252 252 0 0 1 20 230 Z" fill="url(#fan)" />
      <ellipse cx="160" cy="165" rx="52" ry="42" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="2" />
      <circle cx="172" cy="158" r="40" fill="url(#heat)" />
    </svg>
  );
}

export default function Home() {
  const { user } = useAuth();
  const cta = !user
    ? { to: "/register", label: "Create a free account" }
    : user.role === "patient"
    ? { to: roleHome(user.role), label: "Upload a scan" }
    : user.role === "admin"
    ? { to: roleHome(user.role), label: "Manage users" }
    : { to: roleHome(user.role), label: "Open the review queue" };

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">AI-assisted screening support</p>
          <h1>Fetal ultrasound plane recognition, reviewed by clinicians</h1>
          <p className="lead">
            Upload an anonymised ultrasound image. A hybrid classical and quantum model identifies the scan plane,
            shows where it looked, and a doctor confirms the result.
          </p>
          <div className="cta">
            <Link className="btn lg" to={cta.to}>{cta.label}</Link>
            <a className="btn ghost lg" href="#how">How it works</a>
          </div>
          {!user && (
            <p className="hint">
              Already registered? <Link to="/login">Log in</Link>
            </p>
          )}
        </div>
        <div className="hero-art"><ScanArt /></div>
      </section>

      <section aria-labelledby="why" className="block">
        <h2 id="why">What you can do</h2>
        <div className="cards">
          {FEATURES.map((f) => (
            <article key={f.title} className="card">
              <span className="icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" aria-labelledby="how-h" className="block">
        <h2 id="how-h">How it works</h2>
        <ol className="steps">
          {STEPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="safety">
        FetalScan Assist is screening support only, not a diagnosis. It recognises the type of ultrasound view and
        does not assess the health of a pregnancy. Always follow the advice of your clinician.
      </p>
    </>
  );
}