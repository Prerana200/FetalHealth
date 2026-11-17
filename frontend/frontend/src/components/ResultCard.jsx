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
        note={result.heatmap_message}
      />
      <div>
        <h3>
          Predicted head-size category: {result.predicted_class}{" "}
          <small className="muted">(model score {(confidence * 100).toFixed(0)}%)</small>
        </h3>
        {low && (
          <p className="warn" role="note">
            Low model score. Consider uploading a clearer image or asking a clinician to check this result.
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