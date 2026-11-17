import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ResultCard from "./ResultCard.jsx";

const base = {
  id: "1",
  created_at: new Date().toISOString(),
  model_version: "test-1",
  image_url: "",
  heatmap_url: null,
  predicted_class: "Medium",
};
const high = {
  ...base,
  probabilities: { Small: 0.05, Medium: 0.85, Large: 0.1 },
};
const low = {
  ...base,
  probabilities: { Small: 0.3, Medium: 0.4, Large: 0.3 },
};

describe("ResultCard", () => {
  it("shows the predicted category, model score and the safety note", () => {
    render(<ResultCard result={high} />);
    expect(screen.getByText(/predicted head-size category: medium/i)).toBeInTheDocument();
    expect(screen.getByText(/model score 85%/i)).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });

  it("does not warn when the model score is high", () => {
    render(<ResultCard result={high} />);
    expect(screen.queryByText(/low model score/i)).not.toBeInTheDocument();
  });

  it("warns when the model score is below 60%", () => {
    render(<ResultCard result={low} />);
    expect(screen.getByText(/low model score/i)).toBeInTheDocument();
  });

  it("swaps the heatmap in for the image instead of laying it over", () => {
    const { container } = render(<ResultCard result={{ ...high, image_url: "blob:scan", heatmap_url: "data:image/png;base64,AAAA" }} />);
    expect(container.querySelectorAll(".frame img")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/show heatmap/i));
    const imgs = container.querySelectorAll(".frame img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toContain("data:image/png");
    expect(screen.getByText(/not evidence of a finding/i)).toBeInTheDocument();
  });

  it("explains why there is no heatmap when the server gives a reason", () => {
    render(<ResultCard result={{ ...high, heatmap_message: "Heatmap not available for this image." }} />);
    expect(screen.getByText(/heatmap not available/i)).toBeInTheDocument();
  });

  it("offers the heatmap toggle only when a heatmap exists", () => {
    const { rerender } = render(<ResultCard result={high} />);
    expect(screen.queryByLabelText(/show heatmap/i)).not.toBeInTheDocument();
    rerender(<ResultCard result={{ ...high, heatmap_url: "data:image/png;base64,AAAA" }} />);
    expect(screen.getByLabelText(/show heatmap/i)).toBeInTheDocument();
  });
});