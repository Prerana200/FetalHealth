// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteScan from "./components/DeleteScan.jsx";
import { listAssessments } from "./api/client.js";

afterEach(cleanup);

describe("DeleteScan", () => {
  it("asks for confirmation before deleting", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(<DeleteScan scanId="x" onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: /delete scan/i }));
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("goes back without deleting when cancelled", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(<DeleteScan scanId="x" onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: /delete scan/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("button", { name: /delete scan/i })).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("removes the scan from the sample data and reports it", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const [first] = await listAssessments();
    const before = (await listAssessments()).length;
    render(<DeleteScan scanId={first.id} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: /delete scan/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(first.id));
    expect((await listAssessments()).length).toBe(before - 1);
  });

  it("shows the error when the scan cannot be found", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(<DeleteScan scanId="does-not-exist" onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: /delete scan/i }));
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be found/i);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
