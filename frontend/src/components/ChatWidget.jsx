import { useEffect, useRef, useState } from "react";
import { useMatch } from "react-router-dom";
import { chat, CHAT_MAX_CHARS } from "../api/client.js";

const GREETING = {
  id: 0,
  role: "assistant",
  local: true, // shown in the chat but never sent to the backend
  content:
    "Hi! I can explain how this app works and what terms like plane, confidence and heatmap mean. I can't diagnose or give medical advice.",
};
const SUGGESTIONS = ["What does confidence mean?", "What is a heatmap?", "How do I upload a scan?"];

export default function ChatWidget() {
  const match = useMatch("/scans/:id"); // on a report page, the assistant can refer to that scan
  const scanId = match?.params.id ?? null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const log = useRef(null);
  const input = useRef(null);
  const nextId = useRef(1);

  // Keep the newest message in view.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy, open]);

  // Move the cursor into the box when the panel opens.
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const ask = async (history) => {
    setBusy(true);
    setError(null);
    try {
      const { reply } = await chat(history.filter((m) => !m.local), scanId);
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (content) => {
    const clean = content.trim();
    if (!clean || busy) return;
    const next = [
      ...messages,
      { id: nextId.current++, role: "user", content: clean.slice(0, CHAT_MAX_CHARS) },
    ];
    setMessages(next);
    setText("");
    ask(next);
  };

  const clear = () => {
    setMessages([GREETING]);
    setError(null);
    setText("");
  };

  if (!open) {
    return (
      <button className="btn chat-fab" onClick={() => setOpen(true)} aria-label="Open AI assistant">
        Ask AI
      </button>
    );
  }

  return (
    <section
      className="chat"
      role="dialog"
      aria-label="AI assistant"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <div className="chat-head">
        <strong>AI assistant</strong>
        <div>
          <button className="link" onClick={clear}>
            Clear
          </button>
          <button className="link" onClick={() => setOpen(false)} aria-label="Close assistant">
            Close
          </button>
        </div>
      </div>
      <p className="chat-note">
        AI assistant. Not medical advice. Don't share your name or personal details.
        {scanId && " It can refer to the scan you're viewing."}
      </p>

      <div className="chat-log" role="log" aria-live="polite" ref={log}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="msg assistant">Thinking…</div>}
      </div>

      {messages.length === 1 && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => submit(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button className="link" onClick={() => ask(messages)} disabled={busy}>
            Retry
          </button>
        </p>
      )}

      <div className="chat-form">
        <textarea
          ref={input}
          rows="2"
          aria-label="Message"
          placeholder="Ask a question…"
          maxLength={CHAT_MAX_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
        />
        <button className="btn" onClick={() => submit(text)} disabled={busy || !text.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}