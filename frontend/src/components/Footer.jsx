export default function Footer() {
  return (
    <footer className="w-full py-12 border-t border-outline-variant/10 bg-surface-container-lowest mt-24">
      <div className="max-w-container-max-width mx-auto flex flex-col items-center justify-center space-y-6 px-margin-mobile md:px-margin-desktop">
        <div className="flex items-center gap-2">
          <span className="text-label-sm font-mono font-bold text-primary uppercase tracking-widest">Obolus</span>
          <span className="w-1 h-1 bg-outline rounded-full" />
          <span className="text-label-sm text-on-surface-variant opacity-80">Evidence-verified inheritance on GenLayer.</span>
        </div>
        <div className="flex flex-wrap justify-center gap-8">
          <a className="text-label-sm font-mono text-on-surface-variant hover:text-on-surface hover:underline transition-colors" href="https://genlayer.com" target="_blank" rel="noreferrer">
            GenLayer
          </a>
          <a className="text-label-sm font-mono text-on-surface-variant hover:text-on-surface hover:underline transition-colors" href="/README.md">
            Documentation
          </a>
          <a className="text-label-sm font-mono text-on-surface-variant hover:text-on-surface hover:underline transition-colors" href="/admin">
            Platform status
          </a>
        </div>
        <p className="text-[10px] font-mono text-outline-variant">© {new Date().getFullYear()} Obolus. Funds move only on verified evidence.</p>
      </div>
    </footer>
  );
}
