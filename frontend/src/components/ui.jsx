// Small shared primitives derived from DESIGN.md's Components section
// (glass panels, buttons, inputs) — reused across every page instead of
// each page redefining its own markup, unlike the static HTML mockups.

export function GlassPanel({ children, className = "", ...props }) {
  return (
    <div className={`glass-panel rounded-xl ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Icon({ name, className = "", filled = false, style }) {
  return (
    <span className={`material-symbols-outlined ${filled ? "filled" : ""} ${className}`} style={style}>
      {name}
    </span>
  );
}

const buttonVariants = {
  primary:
    "bg-primary text-on-primary hover:brightness-110 shadow-lg shadow-primary/10 disabled:opacity-40 disabled:cursor-not-allowed",
  secondary:
    "border border-secondary/40 text-secondary hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed",
  ghost: "text-on-surface-variant hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed",
  danger: "border border-error/40 text-error hover:bg-error/5 disabled:opacity-40 disabled:cursor-not-allowed",
};

export function Button({ variant = "primary", className = "", children, loading = false, ...props }) {
  return (
    <button
      className={`px-6 py-3 rounded-lg font-medium transition-all active:scale-95 duration-150 inline-flex items-center justify-center gap-2 ${buttonVariants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Icon name="progress_activity" className="animate-spin text-[18px]" />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-label-sm font-mono text-outline mb-2 uppercase tracking-widest">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-on-surface-variant/70">{hint}</p>}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full bg-surface-container-highest border border-outline-variant/50 rounded-lg py-3 px-4 text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full bg-surface-container-highest border border-outline-variant/50 rounded-lg py-3 px-4 text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${className}`}
      {...props}
    />
  );
}

export function Spinner({ className = "" }) {
  return <Icon name="progress_activity" className={`animate-spin ${className}`} />;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-error/10 border border-error/20 text-error">
      <Icon name="error" className="text-[18px] mt-0.5" />
      <p className="text-body-md">{message}</p>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, description }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-on-surface-variant">
      <Icon name={icon} className="text-[40px] mb-4 opacity-40" />
      <p className="font-medium text-on-surface mb-1">{title}</p>
      {description && <p className="text-body-md max-w-sm">{description}</p>}
    </div>
  );
}
