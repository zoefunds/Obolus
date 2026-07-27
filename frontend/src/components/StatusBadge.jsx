// Tone mapping per DESIGN.md "Status Tones": ACTIVE=blue, CLAIM_PENDING=gold,
// PAYOUT_READY=emerald, CANCELLED=rose. Claim statuses extend the same
// language: OPEN reads as pending/gold, CONTESTED as an active dispute
// (blue), CONFIRMED/REFUTED as the two terminal emerald/rose outcomes, and
// INCONCLUSIVE as neutral outline (abstention, not a "loss").
const TONES = {
  ACTIVE: { text: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/20", dot: "bg-secondary" },
  CLAIM_PENDING: { text: "text-primary", bg: "bg-primary/10", border: "border-primary/20", dot: "bg-primary", pulse: true },
  PAYOUT_READY: { text: "text-tertiary", bg: "bg-tertiary/10", border: "border-tertiary/20", dot: "bg-tertiary" },
  CANCELLED: { text: "text-error", bg: "bg-error/10", border: "border-error/20", dot: "bg-error" },

  OPEN: { text: "text-primary", bg: "bg-primary/10", border: "border-primary/20", dot: "bg-primary", pulse: true },
  CONTESTED: { text: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/20", dot: "bg-secondary", pulse: true },
  CONFIRMED: { text: "text-tertiary", bg: "bg-tertiary/10", border: "border-tertiary/20", dot: "bg-tertiary" },
  REFUTED: { text: "text-error", bg: "bg-error/10", border: "border-error/20", dot: "bg-error" },
  INCONCLUSIVE: { text: "text-outline", bg: "bg-outline/10", border: "border-outline/20", dot: "bg-outline" },
};

export default function StatusBadge({ status, size = "md" }) {
  const tone = TONES[status] || TONES.INCONCLUSIVE;
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-label-sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-mono uppercase tracking-widest border ${tone.bg} ${tone.text} ${tone.border} ${padding}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} ${tone.pulse ? "glow-dot" : ""}`} />
      {status}
    </span>
  );
}
