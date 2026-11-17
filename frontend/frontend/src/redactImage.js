// Draws the image at full size, paints solid black over each box, and returns a new File.
// The hidden areas are changed pixel by pixel, so they cannot be recovered from the uploaded file.
// Re-encoding through a canvas also drops metadata such as EXIF.
export async function redactImage(img, boxes, file) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas is not available.");

  g.drawImage(img, 0, 0);
  g.fillStyle = "#000";
  for (const b of boxes) g.fillRect(b.x, b.y, b.w, b.h);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.95));
  if (!blob) throw new Error("Could not create the image.");
  return new File([blob], file.name, { type: file.type });
}