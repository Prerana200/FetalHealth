import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImageUploader from "./ImageUploader.jsx";
import { uploadAssessment } from "../api/client.js";

// Keep the real validation, but replace the upload so tests don't wait on the mock delays.
vi.mock("../api/client.js", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadAssessment: vi.fn(),
}));

const setup = () => {
  const onResult = vi.fn();
  const { container } = render(<ImageUploader onResult={onResult} />);
  const input = container.querySelector('input[type="file"]');
  const choose = (f) => fireEvent.change(input, { target: { files: [f] } });
  return { onResult, choose };
};
const png = () => new File(["x"], "scan.png", { type: "image/png" });
const analyse = () => screen.getByRole("button", { name: /analyse image/i });

beforeEach(() => vi.clearAllMocks());

describe("ImageUploader", () => {
  it("starts with the analyse button disabled", () => {
    setup();
    expect(analyse()).toBeDisabled();
  });

  it("rejects an unsupported format", () => {
    const { choose } = setup();
    choose(new File(["x"], "report.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported format/i);
    expect(analyse()).toBeDisabled();
  });

  it("rejects an empty file", () => {
    const { choose } = setup();
    choose(new File([], "empty.png", { type: "image/png" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/empty/i);
  });

  it("rejects an oversized file", () => {
    const { choose } = setup();
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    choose(big);
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than/i);
  });

  it("previews a valid image and enables analyse", () => {
    const { choose } = setup();
    choose(png());
    expect(screen.getByAltText(/preview of the selected ultrasound/i)).toBeInTheDocument();
    expect(analyse()).toBeEnabled();
  });

  it("passes the result on after a successful upload", async () => {
    const result = { id: "1", predicted_class: "Brain" };
    uploadAssessment.mockResolvedValue(result);
    const { choose, onResult } = setup();
    choose(png());
    fireEvent.click(analyse());
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result));
  });

  it("shows the error and keeps the file when the upload fails", async () => {
    uploadAssessment.mockRejectedValue(new Error("Network error. Check your connection and try again."));
    const { choose, onResult } = setup();
    choose(png());
    fireEvent.click(analyse());
    expect(await screen.findByRole("alert")).toHaveTextContent(/network error/i);
    expect(analyse()).toBeEnabled(); // the user can retry without picking the file again
    expect(onResult).not.toHaveBeenCalled();
  });
});