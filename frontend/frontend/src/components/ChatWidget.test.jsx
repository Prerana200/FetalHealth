import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ChatWidget from "./ChatWidget.jsx";
import { chat } from "../api/client.js";

// Keep everything real except the network call, so tests control the replies.
vi.mock("../api/client.js", async (importOriginal) => ({
  ...(await importOriginal()),
  chat: vi.fn(),
}));

const setup = async (path = "/") => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <ChatWidget />
    </MemoryRouter>
  );
  await user.click(screen.getByRole("button", { name: /open ai assistant/i }));
  return user;
};
const box = () => screen.getByRole("textbox", { name: /message/i });
const send = () => screen.getByRole("button", { name: /^send$/i });

beforeEach(() => vi.clearAllMocks());

describe("ChatWidget", () => {
  it("opens with the safety note and a greeting", async () => {
    await setup();
    expect(screen.getByRole("dialog", { name: /ai assistant/i })).toBeInTheDocument();
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
    expect(screen.getByText(/can't diagnose or give medical advice/i)).toBeInTheDocument();
  });

  it("sends a question and shows the reply", async () => {
    chat.mockResolvedValue({ reply: "Confidence is how strongly the model favours its answer." });
    const user = await setup();
    await user.type(box(), "What is confidence?");
    await user.click(send());
    expect(await screen.findByText(/how strongly the model favours/i)).toBeInTheDocument();
    expect(screen.getByText("What is confidence?")).toBeInTheDocument();
    expect(box()).toHaveValue("");
    expect(chat).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", content: "What is confidence?" })],
      null
    );
  });

  it("does not send the greeting to the backend", async () => {
    chat.mockResolvedValue({ reply: "ok" });
    const user = await setup();
    await user.type(box(), "hi");
    await user.click(send());
    await screen.findByText("ok");
    expect(chat.mock.calls[0][0]).toHaveLength(1);
  });

  it("passes the scan id on a report page", async () => {
    chat.mockResolvedValue({ reply: "ok" });
    const user = await setup("/scans/abc");
    await user.type(box(), "Explain my result");
    await user.click(send());
    await screen.findByText("ok");
    expect(chat).toHaveBeenCalledWith(expect.any(Array), "abc");
  });

  it("will not send an empty message", async () => {
    const user = await setup();
    expect(send()).toBeDisabled();
    await user.type(box(), "   ");
    expect(send()).toBeDisabled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("sends a suggested question with one click", async () => {
    chat.mockResolvedValue({ reply: "A heatmap shows attention." });
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /what is a heatmap/i }));
    expect(await screen.findByText(/a heatmap shows attention/i)).toBeInTheDocument();
  });

  it("shows an error and lets the user retry", async () => {
    chat
      .mockRejectedValueOnce(new Error("The assistant is unavailable right now. Try again later."))
      .mockResolvedValueOnce({ reply: "Back again" });
    const user = await setup();
    await user.type(box(), "hello");
    await user.click(send());
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Back again")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes with the Escape key", async () => {
    const user = await setup();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open ai assistant/i })).toBeInTheDocument();
  });
});