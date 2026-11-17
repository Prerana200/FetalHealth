// The three head-size categories and where each sits on the scale.
// Cut-points are the 33rd and 67th percentiles of the training HC values (dataset-derived, not clinical).

export const HC_CUTS = { lower: 131.2, upper: 172.9 }; // millimetres

const CATEGORIES = [
  { name: "Small", range: `HC below ${HC_CUTS.lower} mm` },
  { name: "Medium", range: `HC from ${HC_CUTS.lower} mm to ${HC_CUTS.upper} mm` },
  { name: "Large", range: `HC above ${HC_CUTS.upper} mm` },
];

export const HC_SEGMENTS = CATEGORIES;

// Returns where the marker goes (percent from the left, in the middle of the category) and a description.
export function describeCategory(name) {
  const index = CATEGORIES.findIndex((c) => c.name === name);
  if (index === -1) {
    return { known: false, index: -1, left: 0, range: "", text: "This category is not one of Small, Medium or Large, so no position is shown." };
  }
  const { range } = CATEGORIES[index];
  return {
    known: true,
    index,
    left: ((index + 0.5) / CATEGORIES.length) * 100,
    range,
    text: `${name} means ${range} in the training data.`,
  };
}
