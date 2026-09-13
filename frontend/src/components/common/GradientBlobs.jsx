/**
 * Soft, plain gradient-blob backdrop — the calm alternative to the
 * old node/constellation graph. Pure decoration, no motion clutter.
 */
export default function GradientBlobs({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 700"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blobA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b6cf6" />
          <stop offset="100%" stopColor="#8b6bff" />
        </linearGradient>
        <linearGradient id="blobB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2fd7e6" />
          <stop offset="100%" stopColor="#3b6cf6" />
        </linearGradient>
        <filter id="blur1"><feGaussianBlur stdDeviation="46" /></filter>
      </defs>
      <g filter="url(#blur1)" opacity="0.5">
        <path fill="url(#blobA)" d="M120,60 C260,-20 460,10 560,110 C660,210 640,360 520,420 C400,480 260,440 170,360 C80,280 -20,140 120,60 Z" />
        <path fill="url(#blobB)" d="M420,320 C560,280 720,340 760,460 C800,580 700,660 560,650 C420,640 300,560 300,470 C300,410 350,340 420,320 Z" />
      </g>
    </svg>
  );
}
