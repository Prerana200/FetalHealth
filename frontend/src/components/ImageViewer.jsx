import { useState } from "react";

// Shows an image with optional heatmap overlay. Zoom with the buttons, pan by scrolling the frame.
export default function ImageViewer({ src, heatmap, alt }) {
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
          <img src={src} alt={alt} />
          {heatmap && showHeatmap && <img src={heatmap} alt="" className="heat" />}
        </div>
      </div>

      {heatmap && (
        <figcaption>
          The heatmap shows where the feature extractor focused. It is not evidence of a finding.
        </figcaption>
      )}
    </figure>
  );
}