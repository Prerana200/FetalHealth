const QUESTIONS = [
  [
    "What does FetalScan Assist do?",
    "It recognises which standard plane an ultrasound image shows (for example Brain, Femur or Abdomen) and gives a probability for each class. A doctor can then confirm or dispute the result.",
  ],
  [
    "Does it diagnose anything?",
    "No. It does not assess the health of a pregnancy or detect abnormalities. It is screening support only, and a clinician must interpret every scan.",
  ],
  [
    "Which images can I upload?",
    "JPEG or PNG files up to 10 MB. Use anonymised images only: remove names, dates and any other identifying details before uploading.",
  ],
  [
    "What does the confidence figure mean?",
    "It shows how strongly the model favours its top answer. Below 60% the app shows a low-confidence warning, which means a clearer image or a clinician's check is a good idea. A high figure is not a guarantee.",
  ],
  [
    "What is the heatmap?",
    "It highlights the areas of the image the model paid most attention to. It is not evidence of a finding and can highlight areas that are not medically important.",
  ],
  [
    "Who reviews my scan?",
    "Doctors with an account can open your scan, agree or disagree with the prediction and leave a comment. The outcome appears in your report history.",
  ],
  [
    "Can I save or print a report?",
    "Yes. Open a scan from your history and use the print option. Menus, buttons and the chat widget are hidden in the printed version.",
  ],
  [
    "I have symptoms or I am worried. What should I do?",
    "Contact your doctor or local emergency services. This app cannot assess symptoms, and the chat assistant cannot give medical advice.",
  ],
];

export default function Faq() {
  return (
    <section className="faq">
      <h1>Frequently asked questions</h1>
      {QUESTIONS.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}