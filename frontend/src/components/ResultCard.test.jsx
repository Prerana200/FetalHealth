import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ResultCard from "./ResultCard.jsx";

const base = {
  id: "1",
  created_at: new Date().toISOString(),
  model_version: "test-1",
  image_url: "",
  heatmap_url: null,
  predicted_class: "Brain",
};
const high = {
  ...base,
  probabilities: { Brain: 0.85, Femur: 0.05, Abdomen: 0.04, Thorax: 0.03, Cervix: 0.02, Other: 0.01 },
};
const low = {
  ...base,
  probabilities: { Brain: 0.35, Femur: 0.25, Abdomen: 0.15, Thorax: 0.1, Cervix: 0.1, Other: 0.05 },
};

describe("ResultCard", () => {
  it("shows the predicted plane, confidence and the safety note", () => {
    render(<ResultCard result={high} />);
    expect(screen.getByText(/predicted plane: brain/i)).toBeInTheDocument();
    expect(screen.getByText(/85% confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });

  it("does not warn when confidence is high", () => {
    render(<ResultCard result={high} />);
    expect(screen.queryByText(/low confidence/i)).not.toBeInTheDocument();
  });

  it("warns when confidence is below 60%", () => {
    render(<ResultCard result={low} />);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
  });

  it("offers the heatmap toggle only when a heatmap exists", () => {
    const { rerender } = render(<ResultCard result={high} />);
    expect(screen.queryByLabelText(/show heatmap/i)).not.toBeInTheDocument();
    rerender(<ResultCard result={{ ...high, heatmap_url: "data:image/png;base64,AAAA" }} />);
    expect(screen.getByLabelText(/show heatmap/i)).toBeInTheDocument();
  });
});