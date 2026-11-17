import { describeCategory, HC_SEGMENTS } from "../hcScale.js";

// A bar split into Small, Medium and Large with a marker on the predicted category. Orientation aid only.
export default function HcScale({ category }) {
  const d = describeCategory(category);

  return (
    <section className="panel hcscale" aria-labelledby="hcscale-h">
      <h2 id="hcscale-h">Where this category sits</h2>
      <div className="hcscale-bar" role="img" aria-label={`Head-size scale. ${d.text}`}>
        {HC_SEGMENTS.map((s, i) => (
          <span key={s.name} className={`seg${i === d.index ? " on" : ""}`}>
            {s.name}
          </span>
        ))}
        {d.known && <span className="marker" style={{ left: `${d.left}%` }} aria-hidden="true" />}
      </div>
      <p className="hcscale-name">{category}</p>
      <p>{d.text}</p>
      <p className="hint">
        Orientation only. The categories are groups made from the training data, not clinical growth standards. This
        scale does not show a measurement or the health of the baby.
      </p>
    </section>
  );
}
