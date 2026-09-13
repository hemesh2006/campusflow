/**
 * Flat, plain illustration — a person at a console with task cards
 * orbiting them. Stands in for the old "agent constellation" without
 * the busy connecting-line look.
 */
export default function WorkflowIllustration({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 360"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="deskGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2440" />
          <stop offset="100%" stopColor="#141b32" />
        </linearGradient>
      </defs>

      {/* floor shadow */}
      <ellipse cx="210" cy="322" rx="150" ry="14" fill="#000" opacity="0.25" />

      {/* desk */}
      <rect x="80" y="230" width="260" height="14" rx="7" fill="url(#deskGrad)" />
      <rect x="100" y="244" width="10" height="60" rx="4" fill="#141b32" />
      <rect x="310" y="244" width="10" height="60" rx="4" fill="#141b32" />

      {/* monitor */}
      <rect x="150" y="140" width="120" height="82" rx="10" fill="#101627" stroke="rgba(148,178,255,0.25)" />
      <rect x="162" y="152" width="96" height="58" rx="4" fill="#0b1120" />
      <rect x="168" y="160" width="44" height="6" rx="3" fill="#3b6cf6" />
      <rect x="168" y="172" width="70" height="5" rx="2.5" fill="#37d3a3" />
      <rect x="168" y="182" width="56" height="5" rx="2.5" fill="#2fd7e6" />
      <rect x="168" y="192" width="34" height="5" rx="2.5" fill="#f5b84e" />
      <rect x="198" y="222" width="24" height="10" fill="#101627" />
      <rect x="182" y="230" width="56" height="6" rx="3" fill="#101627" />

      {/* person (simple, flat) */}
      <circle cx="210" cy="118" r="20" fill="#f5b84e" />
      <path d="M172 200 C172 168 246 168 246 200 L246 226 L172 226 Z" fill="#3b6cf6" />

      {/* floating task chips (calm, static) */}
      <g>
        <rect x="40" y="70" width="86" height="34" rx="10" fill="#141b32" stroke="rgba(148,178,255,0.22)" />
        <circle cx="58" cy="87" r="5" fill="#37d3a3" />
        <rect x="70" y="82" width="46" height="5" rx="2.5" fill="#8fa2d6" />
        <rect x="70" y="91" width="30" height="4" rx="2" fill="#4a5580" />
      </g>
      <g>
        <rect x="294" y="46" width="90" height="34" rx="10" fill="#141b32" stroke="rgba(148,178,255,0.22)" />
        <circle cx="312" cy="63" r="5" fill="#3b6cf6" />
        <rect x="324" y="58" width="48" height="5" rx="2.5" fill="#8fa2d6" />
        <rect x="324" y="67" width="32" height="4" rx="2" fill="#4a5580" />
      </g>
      <g>
        <rect x="300" y="120" width="86" height="34" rx="10" fill="#141b32" stroke="rgba(148,178,255,0.22)" />
        <circle cx="318" cy="137" r="5" fill="#8b6bff" />
        <rect x="330" y="132" width="42" height="5" rx="2.5" fill="#8fa2d6" />
        <rect x="330" y="141" width="28" height="4" rx="2" fill="#4a5580" />
      </g>
      <g>
        <rect x="30" y="150" width="82" height="34" rx="10" fill="#141b32" stroke="rgba(148,178,255,0.22)" />
        <circle cx="48" cy="167" r="5" fill="#f5b84e" />
        <rect x="60" y="162" width="42" height="5" rx="2.5" fill="#8fa2d6" />
        <rect x="60" y="171" width="26" height="4" rx="2" fill="#4a5580" />
      </g>
    </svg>
  );
}
