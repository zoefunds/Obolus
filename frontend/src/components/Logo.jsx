export default function Logo({ size = 32, withWordmark = true, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="obolusCoinMark" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe088" />
            <stop offset="0.55" stopColor="#f2ca50" />
            <stop offset="1" stopColor="#a9821c" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="#111317" />
        <circle cx="32" cy="32" r="27" fill="url(#obolusCoinMark)" />
        <circle cx="32" cy="32" r="27" fill="none" stroke="#3c2f00" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#3c2f00" strokeOpacity="0.35" strokeWidth="1" />
        <path d="M32 15 V37" stroke="#3c2f00" strokeWidth="2.25" strokeLinecap="round" />
        <path
          d="M20 37 C20 33 26 31 32 31 C38 31 44 33 44 37 C44 42 38 45 32 45 C26 45 20 42 20 37 Z"
          fill="none"
          stroke="#3c2f00"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path d="M24 22 L32 15 L40 22" fill="none" stroke="#3c2f00" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWordmark && <span className="text-headline-md font-extrabold text-primary tracking-tight">Obolus</span>}
    </div>
  );
}
