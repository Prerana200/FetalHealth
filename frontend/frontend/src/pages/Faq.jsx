const QUESTIONS = [
  [
    "What does FetalScan Assist do?",
    "It sorts a fetal head ultrasound image into a size category (Small, Medium or Large) based on head circumference groups from the training data, and gives a model score for each category. A doctor can then confirm or dispute the result.",
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
    "What does the model score mean?",
    "It shows how strongly the model favours its top category. It is not a calibrated probability and not a measure of medical certainty. Below 60% the app shows a low-score warning, which means a clearer image or a clinician's check is a good idea.",
  ],
  [
    "What do Small, Medium and Large mean?",
    "They are groups of head circumference (HC) values taken from the training data: Small is below 131.2 mm, Medium is 131.2 to 172.9 mm and Large is above 172.9 mm. They are experimental groups, not clinical growth standards or signs of a problem.",
  ],
  [
    "What is the heatmap?",
    "It is a pixel-saliency map: it highlights the pixels that changed the model's output the most. It is not evidence of a finding, and strong responses can appear near the edges or outside the fetal head.",
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