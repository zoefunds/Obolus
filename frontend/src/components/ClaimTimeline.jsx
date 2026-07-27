import { Icon } from "./ui.jsx";
import { formatTs, formatCountdown } from "../lib/time.js";

function Step({ state, icon, title, subtitle, children }) {
  // state: "done" | "current" | "upcoming"
  const circle =
    state === "done"
      ? "bg-secondary text-on-secondary"
      : state === "current"
      ? "bg-primary text-on-primary pulse-gold"
      : "bg-surface-variant text-on-surface-variant border border-outline-variant";
  return (
    <div className={`relative flex gap-6 ${state === "upcoming" ? "opacity-40" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 ${circle}`}>
        <Icon name={icon} className="text-[16px]" />
      </div>
      <div className="pb-10">
        <h3 className={`text-headline-md font-semibold ${state === "current" ? "text-primary" : ""}`}>{title}</h3>
        <p className="text-on-surface-variant text-label-sm font-mono">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export default function ClaimTimeline({ claim, now }) {
  const deadlinePassed = now >= Number(claim.contest_deadline_ts);
  const resolved = Number(claim.resolved_ts) > 0;
  const countdown = !deadlinePassed ? formatCountdown(claim.contest_deadline_ts) : null;

  return (
    <div className="relative pb-4">
      <div className="absolute left-4 top-4 bottom-4 w-px bg-outline-variant/30" />

      <Step state="done" icon="check" title="Claim Submitted" subtitle={formatTs(claim.submitted_ts)} />

      <Step
        state={resolved ? "done" : "current"}
        icon="gavel"
        title="Contest Window"
        subtitle={deadlinePassed ? `Closed ${formatTs(claim.contest_deadline_ts)}` : `Ends in ${countdown}`}
      >
        {!resolved && !deadlinePassed && (
          <div className="mt-4 p-4 bg-surface-container-high rounded border border-primary/20">
            <p className="text-body-md text-on-surface">
              Vault assets are frozen. Anyone with counter-evidence may submit a contest before the window closes.
            </p>
          </div>
        )}
      </Step>

      <Step
        state={resolved ? "done" : deadlinePassed ? "current" : "upcoming"}
        icon={resolved ? "verified" : "lock_open"}
        title={resolved ? `Resolved — ${claim.determination || claim.status}` : "Resolvable"}
        subtitle={resolved ? formatTs(claim.resolved_ts) : deadlinePassed ? "Ready now" : `Estimated ${formatTs(claim.contest_deadline_ts)}`}
      />
    </div>
  );
}
