import { Link } from "react-router-dom";
import { Icon } from "../components/ui.jsx";

const PROBLEMS = [
  {
    icon: "timer_off",
    tone: "error",
    title: "Inactivity Timers",
    body: "The classic \"dead man's switch\" fires on silence, not death. Travel, hospitalization, a lost device, or incarceration all look identical to a timer — and none of them mean the person died.",
    tag: "RISK: PREMATURE RELEASE",
  },
  {
    icon: "supervisor_account",
    tone: "outline",
    title: "Trusted Executors",
    body: "A single attorney or committee decides, and their word is final. This recreates exactly what probate courts exist to referee — a disputed call, with no built-in way to adjudicate it except lawyers and time.",
    tag: "RISK: A SINGLE POINT OF TRUST",
  },
  {
    icon: "verified_user",
    tone: "primary",
    title: "Evidence, Judged by Consensus",
    body: "Obolus asks a claimant to produce real, fetchable evidence, gives anyone with contrary evidence a genuine contest window, and lets independent GenLayer validators judge the totality of it before funds move.",
    tag: "THE OBOLUS STANDARD",
  },
];

const STEPS = [
  {
    n: "01",
    tag: "SETUP",
    title: "Fund a vault",
    body: "Lock GEN, name a beneficiary and the subject whose death must be evidenced. The vault sits ACTIVE — dormant, fully reclaimable — until a claim is opened.",
  },
  {
    n: "02",
    tag: "CLAIM & CONTEST",
    title: "Evidence, then a window",
    body: "Anyone may open a death claim with sourced evidence and a bond. The vault enters CLAIM_PENDING and a fixed contest window opens for counter-evidence, also bonded.",
  },
  {
    n: "03",
    tag: "RESOLUTION",
    title: "Validator consensus",
    body: "Once the window closes, validators independently fetch every source and reach one verdict. Only an exact, HIGH-confidence agreement ever moves funds — anything less abstains to INCONCLUSIVE.",
  },
];

const OUTCOMES = [
  {
    condition: "CONFIRMED",
    conditionSub: "DECEASED, high confidence",
    tone: "tertiary",
    description: "Vault balance credited to the beneficiary. Claimant's bond returned; a contester's bond is forfeited into the same payout.",
    state: "WITHDRAWABLE",
  },
  {
    condition: "REFUTED",
    conditionSub: "ALIVE_OR_REFUTED, high confidence",
    tone: "error",
    description: "No payout. Claimant's bond is slashed into the vault. Contester's bond returned in full — they were right.",
    state: "VAULT REOPENS",
  },
  {
    condition: "INCONCLUSIVE",
    conditionSub: "evidence thin, ambiguous, or unreachable",
    tone: "outline",
    description: "Nobody is penalized. Both bonds return in full. A fresh, better-evidenced claim can be submitted later.",
    state: "VAULT REOPENS",
  },
];

const toneClasses = {
  error: { border: "border-l-error", bg: "bg-error/10", text: "text-error", tagText: "text-error/60" },
  outline: { border: "border-l-outline", bg: "bg-outline/10", text: "text-outline", tagText: "text-outline/60" },
  primary: { border: "border-l-primary", bg: "bg-primary/10", text: "text-primary", tagText: "text-primary/60" },
  tertiary: { border: "border-l-tertiary", bg: "bg-tertiary/10", text: "text-tertiary", tagText: "text-tertiary/60" },
};

export default function LandingPage() {
  return (
    <div className="space-y-24">
      {/* HERO */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="max-w-3xl space-y-6">
          <span className="inline-block px-3 py-1 bg-surface-container rounded font-mono text-label-sm text-primary uppercase tracking-widest border border-outline-variant/20">
            Built on GenLayer
          </span>
          <h1 className="text-[26px] md:text-[34px] leading-[1.2] font-extrabold tracking-tighter text-on-surface">
            Inheritance that waits for truth, <span className="text-primary">not just a timer.</span>
          </h1>
          <p className="text-body-md text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Obolus is an escrow that only releases inherited GEN when GenLayer's validator network independently
            reads real, fetched evidence and agrees a specific named person has died — never on silence, never on
            one party's word.
          </p>
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/vaults/new"
              className="px-8 py-3 bg-primary text-on-primary font-bold rounded-lg gold-glow hover:scale-[1.02] transition-transform flex items-center gap-2"
            >
              <span>Create a Vault</span>
              <Icon name="arrow_forward" className="text-[20px]" />
            </Link>
            <Link
              to="/dashboard"
              className="px-8 py-3 border border-secondary text-secondary font-bold rounded-lg hover:bg-secondary/5 transition-colors"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-headline-lg font-bold">Legacy systems are fragile</h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Standard solutions rely on a central point of failure or an assumption of absence.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {PROBLEMS.map((p) => {
            const t = toneClasses[p.tone];
            return (
              <div key={p.title} className={`glass-panel p-8 space-y-6 rounded-xl border-l-4 ${t.border} ${p.tone === "primary" ? "bg-primary/5" : ""}`}>
                <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${t.bg}`}>
                  <Icon name={p.icon} className={t.text} />
                </div>
                <h3 className="text-headline-md font-semibold">{p.title}</h3>
                <p className="text-on-surface-variant">{p.body}</p>
                <div className={`pt-4 font-mono text-label-sm ${t.tagText}`}>{p.tag}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="space-y-16">
        <div className="space-y-2">
          <h2 className="text-headline-lg font-bold">Three phases, evidence-driven throughout</h2>
          <p className="text-on-surface-variant">No arbitrary timers. No single decider.</p>
        </div>
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12">
          {STEPS.map((s) => (
            <div key={s.n} className="relative space-y-4">
              <div className="text-[40px] font-black text-outline/10 absolute -top-6 -left-1 select-none">{s.n}</div>
              <div className="font-mono text-label-sm text-primary bg-primary/10 px-3 py-1 inline-block rounded mb-4 relative">
                {s.tag}
              </div>
              <h4 className="text-headline-md font-semibold relative">{s.title}</h4>
              <p className="text-on-surface-variant relative">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* OUTCOME TABLE */}
      <section className="space-y-8">
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
            <h3 className="text-headline-md font-semibold">Every terminal outcome</h3>
            <span className="font-mono text-label-sm text-on-surface-variant">RESOLVE_CLAIM VERDICT</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-high/50 font-mono text-label-sm text-on-surface-variant border-b border-outline-variant/20">
                  <th className="px-6 py-4 uppercase tracking-wider">Verdict</th>
                  <th className="px-6 py-4 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-4 uppercase tracking-wider">What happens</th>
                  <th className="px-6 py-4 uppercase tracking-wider">Vault state</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {OUTCOMES.map((o) => {
                  const t = toneClasses[o.tone];
                  return (
                    <tr key={o.condition}>
                      <td className="px-6 py-6">
                        <span className={`px-3 py-1 rounded-full font-mono text-label-sm border ${t.bg} ${t.text} ${t.border.replace("border-l-", "border-")}`}>
                          {o.condition}
                        </span>
                      </td>
                      <td className="px-6 py-6 text-label-sm font-mono text-on-surface-variant">{o.conditionSub}</td>
                      <td className="px-6 py-6 text-on-surface-variant">{o.description}</td>
                      <td className="px-6 py-6 font-mono text-label-sm">{o.state}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="glass-panel p-12 rounded-2xl text-center space-y-8 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px]" />
        <div className="relative space-y-4">
          <h2 className="text-headline-lg font-bold">Ready to build your legacy on evidence?</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            Deployed on GenLayer StudioNet. Every write is a permissionless, auditable on-chain call.
          </p>
          <div className="pt-6">
            <Link
              to="/vaults/new"
              className="inline-block px-12 py-4 bg-primary text-on-primary font-bold rounded-lg gold-glow hover:scale-[1.02] transition-transform"
            >
              Launch Dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
