// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HcScale from "./components/HcScale.jsx";

afterEach(cleanup);

describe("HcScale", () => {
  it("shows the heading, the category name and a described scale", () => {
    render(<HcScale category="Medium" />);
    expect(screen.getByRole("heading", { name: /where this category sits/i })).toBeTruthy();
    expect(screen.getByText("Medium", { selector: ".hcscale-name" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /131.2 mm to 172.9 mm/i })).toBeTruthy();
  });

  it("highlights only the predicted category and draws one marker", () => {
    const { container } = render(<HcScale category="Large" />);
    const on = container.querySelectorAll(".seg.on");
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toBe("Large");
    expect(container.querySelectorAll(".marker")).toHaveLength(1);
  });

  it("draws no marker for an unknown category", () => {
    const { container } = render(<HcScale category="Other" />);
    expect(container.querySelector(".marker")).toBeNull();
  });

  it("says it is not a clinical standard", () => {
    render(<HcScale category="Small" />);
    expect(screen.getByText(/not clinical growth standards/i)).toBeTruthy();
  });
});
