export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

// Matches STORYBOARD.md exactly (start–end in seconds).
export const SCENES = [
  {name: 'Cold Open', start: 0, end: 5},
  {name: 'Two Broken Mechanisms', start: 5, end: 13},
  {name: 'Product Reveal', start: 13, end: 18},
  {name: 'Vault Creation', start: 18, end: 31},
  {name: 'Claim Submitted', start: 31, end: 40},
  {name: 'Contest Window', start: 40, end: 48},
  {name: 'Mechanism', start: 48, end: 66},
  {name: 'Three Outcomes', start: 66, end: 76},
  {name: 'Owner Cannot Move Funds', start: 76, end: 86},
  {name: 'Ecosystem', start: 86, end: 95},
  {name: 'Closing', start: 95, end: 105},
] as const;

export const TOTAL_DURATION_SECONDS = 105;
export const TOTAL_DURATION_FRAMES = sec(TOTAL_DURATION_SECONDS);

export const sceneFrames = (name: (typeof SCENES)[number]['name']) => {
  const s = SCENES.find((x) => x.name === name)!;
  return {start: sec(s.start), end: sec(s.end), duration: sec(s.end - s.start)};
};
