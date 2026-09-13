export default function StudyIllustration({ className = "" }) {
  return (
    <svg viewBox="0 0 260 220" width="100%" height="100%" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="studyBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* floating icon chips */}
      <g opacity="0.95">
        <circle cx="42" cy="46" r="20" fill="#fff" />
        <circle cx="42" cy="46" r="7" fill="none" stroke="#61dafb" strokeWidth="2" />
        <ellipse cx="42" cy="46" rx="12" ry="4.5" fill="none" stroke="#61dafb" strokeWidth="1.6" />
        <ellipse cx="42" cy="46" rx="12" ry="4.5" fill="none" stroke="#61dafb" strokeWidth="1.6" transform="rotate(60 42 46)" />
        <ellipse cx="42" cy="46" rx="12" ry="4.5" fill="none" stroke="#61dafb" strokeWidth="1.6" transform="rotate(120 42 46)" />
      </g>
      <g opacity="0.95">
        <circle cx="214" cy="40" r="18" fill="#fff" />
        <path d="M206 34 h16 M206 40 h16 M206 46 h10" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g opacity="0.95">
        <circle cx="222" cy="112" r="17" fill="#fff" />
        <ellipse cx="222" cy="106" rx="8" ry="3.4" fill="none" stroke="#f59e0b" strokeWidth="2" />
        <path d="M214 106 v8 c0 2.2 3.6 4 8 4 s8 -1.8 8 -4 v-8" fill="none" stroke="#f59e0b" strokeWidth="2" />
      </g>

      {/* desk + laptop */}
      <ellipse cx="120" cy="196" rx="88" ry="10" fill="#4338ca" opacity="0.12" />
      <rect x="60" y="150" width="120" height="10" rx="4" fill="#e0e7ff" />
      <path d="M96 118 L146 118 L152 150 L90 150 Z" fill="#312e81" />
      <rect x="98" y="122" width="46" height="24" rx="2" fill="#818cf8" />
      <rect x="103" y="126" width="20" height="3" rx="1.5" fill="#fff" opacity="0.8" />
      <rect x="103" y="132" width="30" height="2.4" rx="1.2" fill="#fff" opacity="0.5" />
      <rect x="103" y="137" width="24" height="2.4" rx="1.2" fill="#fff" opacity="0.5" />

      {/* person */}
      <circle cx="120" cy="70" r="22" fill="#ffd7b0" />
      <path d="M100 66 c0 -16 40 -16 40 0 l-4 -2 c-10 -6 -22 -6 -32 0 Z" fill="#2b2144" />
      <path d="M78 150 c0 -34 84 -34 84 0 l-6 6 H84 Z" fill="url(#studyBody)" />
      <path d="M100 108 l20 14 20 -14" fill="none" stroke="#4c3d99" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
