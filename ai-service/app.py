
import gradio as gr

from inference import (
    HybridUltrasoundClassifier,
    DEFAULT_PIXEL_SIZE,
)

# Load the models once when the app starts
classifier = HybridUltrasoundClassifier()


def predict_ultrasound(image, pixel_size_mm):
    try:
        if image is None:
            return "Please upload an ultrasound image."

        result = classifier.predict(image, pixel_size_mm)

        lines = [
            "HYBRID CLASSICAL-QUANTUM ULTRASOUND CLASSIFICATION",
            "",
            f"Predicted Category: {result['predicted_category']}",
            "",
            "MODEL SCORES",
        ]

        for name, score in result["model_scores"].items():
            lines.append(f"{name}: {score * 100:.2f}%")

        lines.extend([
            "",
            "TECHNICAL DETAILS",
            f"Classical feature shape: {result['classical_feature_shape']}",
            f"Quantum feature shape: {result['quantum_feature_shape']}",
            f"Pixel size: {result['pixel_size_mm']} mm/pixel",
            f"Fusion weight: {result['fusion_weight']:.2f} classical / "
            f"{1-result['fusion_weight']:.2f} quantum",
            "",
            "CLASSICAL MODEL SCORES",
        ])

        for name, score in zip(
            ["Small", "Medium", "Large"],
            result["classical_scores"]
        ):
            lines.append(f"{name}: {score * 100:.2f}%")

        lines.extend(["", "QUANTUM MODEL SCORES"])

        for name, score in zip(
            ["Small", "Medium", "Large"],
            result["quantum_scores"]
        ):
            lines.append(f"{name}: {score * 100:.2f}%")

        lines.extend([
            "",
            "DISCLAIMER",
            result["note"],
        ])

        return "\n".join(lines)

    except Exception as error:
        return f"Prediction error: {type(error).__name__}: {error}"


demo = gr.Interface(
    fn=predict_ultrasound,
    inputs=[
        gr.Image(type="pil", label="Upload Fetal Ultrasound Image"),
        gr.Number(
            value=DEFAULT_PIXEL_SIZE,
            label="Pixel Size (mm/pixel)"
        ),
    ],
    outputs=gr.Textbox(
        label="Hybrid Model Result",
        lines=22
    ),
    title="Hybrid Classical-Quantum Ultrasound Classification",
    description=(
        "Upload a fetal ultrasound image to classify the head "
        "circumference category as Small, Medium, or Large. "
        "Use the supplied pixel size when known."
    ),
)

if __name__ == "__main__":
    demo.launch()
