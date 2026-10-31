import ImageViewer from "./ImageViewer.jsx";
import ProbabilityChart from "./ProbabilityChart.jsx";
import SafetyNote from "./SafetyNote.jsx";
import { LOW_CONFIDENCE } from "../api/client.js";

export default function ResultCard({ result }) {
  const confidence = result.probabilities[result.predicted_class];
  const low = confidence < LOW_CONFIDENCE;

  return (
    <article className="result">
      <ImageViewer
        src={result.image_url}
        heatmap={result.heatmap_url}
        alt="Uploaded fetal ultrasound"
      />
      <div>
        <h3>
          Predicted plane: {result.predicted_class}{" "}
          <small className="muted">({(confidence * 100).toFixed(0)}% confidence)</small>
        </h3>
        {low && (
          <p className="warn" role="note">
            Low confidence. Consider uploading a clearer image or asking a clinician to check this result.
          </p>
        )}
        <ProbabilityChart
          probabilities={result.probabilities}
          predicted={result.predicted_class}
        />
        <SafetyNote version={result.model_version} />
      </div>
    </article>
  );
}