import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../auth/AuthContext.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const MOCK = import.meta.env.VITE_USE_MOCK === "true";
const SRC = "https://accounts.google.com/gsi/client";

// Loads Google's sign-in script once.
function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    let script = document.querySelector(`script[src="${SRC}"]`);
    const isNew = !script;
    if (isNew) {
      script = document.createElement("script");
      script.src = SRC;
      script.async = true;
    }
    script.addEventListener("load", resolve);
    script.addEventListener("error", reject);
    if (isNew) document.head.appendChild(script);
  });
}

export default function GoogleButton({ onError }) {
  const { loginWithGoogle } = useAuth();
  const nav = useNavigate();
  const holder = useRef(null);

  // Keep the latest handlers in a ref so Google is initialised only once.
  const handlers = useRef({});
  handlers.current.finish = async (credential) => {
    try {
      const user = await loginWithGoogle(credential);
      nav(roleHome(user.role), { replace: true });
    } catch (e) {
      onError(e.message);
    }
  };
  handlers.current.fail = onError;

  useEffect(() => {
    if (MOCK || !CLIENT_ID) return;
    loadScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => handlers.current.finish(response.credential),
        });
        window.google.accounts.id.renderButton(holder.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
        });
      })
      .catch(() => handlers.current.fail("Could not load Google sign-in. Check your connection."));
  }, []);

  if (MOCK) {
    return (
      <button type="button" className="btn ghost wide" onClick={() => handlers.current.finish("mock")}>
        Continue with Google (demo)
      </button>
    );
  }
  if (!CLIENT_ID) {
    return <p className="hint">Google sign-in is not set up. Add VITE_GOOGLE_CLIENT_ID to .env.</p>;
  }
  return <div ref={holder} className="google-wrap" />;
}