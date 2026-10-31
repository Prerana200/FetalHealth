// Ultrasound sector on an indigo badge, with a coral "focus" dot.
export default function Logo({ size = 32 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#logo-bg)" />
      <path d="M20 8 L33 28 A24 24 0 0 1 7 28 Z" fill="#ffffff" fillOpacity="0.93" />
      <circle cx="20" cy="22" r="4.2" fill="#ff7a59" />
    </svg>
  );
}