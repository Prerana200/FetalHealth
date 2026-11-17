import { useState } from "react";

// Shows an image, and optionally its pixel-saliency heatmap in its place. The heatmap image already has the
// ultrasound blended in and is square (64 x 64 input), so it is swapped in rather than laid over the original.
// Zoom with the buttons, pan by scrolling the frame.
export default function ImageViewer({ src, heatmap, alt, note }) {
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [zoom, setZoom] = useState(1);

  return (
    <figure className="viewer">
      <div className="tools">
        {heatmap ? (
          <label>
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />{" "}
            Show heatmap
          </label>
        ) : (
          <span />
        )}
        <span>
          <button
            className="btn ghost sm"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            aria-label="Zoom out"
          >
            −
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            className="btn ghost sm"
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            aria-label="Zoom in"
          >
            +
          </button>
        </span>
      </div>

      <div className="frame" tabIndex={0} aria-label="Image viewer, scroll to pan">
        <div className="stack" style={{ width: `${zoom * 100}%` }}>
          {heatmap && showHeatmap ? (
            <img src={heatmap} alt="Pixel-saliency heatmap of the model input" className="heatmap-img" />
          ) : (
            <img src={src} alt={alt} />
          )}
        </div>
      </div>

      {heatmap && (
        <figcaption>
          The heatmap shows which pixels changed the model's output the most. It is not evidence of a finding, and
          strong responses can appear near the edges or outside the fetal head.
        </figcaption>
      )}
      {!heatmap && note && <figcaption>{note}</figcaption>}
    </figure>
  );
}