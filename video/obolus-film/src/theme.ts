// Tokens transcribed verbatim from ../../frontend/tailwind.config.js — the real app's
// design system. Do not invent new colors; if a new one is needed, pull it from that file.
export const theme = {
  colors: {
    background: '#0A0B0D',
    onBackground: '#e2e2e8',
    surface: '#111317',
    surfaceContainerLowest: '#0c0e12',
    surfaceContainerLow: '#1a1c20',
    surfaceContainer: '#1e2024',
    surfaceContainerHigh: '#282a2e',
    surfaceContainerHighest: '#333539',
    surfaceBright: '#37393e',
    onSurface: '#e2e2e8',
    onSurfaceVariant: '#d0c5af',
    outline: '#99907c',
    outlineVariant: '#4d4635',
    primary: '#f2ca50',
    onPrimary: '#3c2f00',
    primaryContainer: '#d4af37',
    onPrimaryContainer: '#554300',
    secondary: '#7bd0ff',
    onSecondary: '#00354a',
    secondaryContainer: '#00a6e0',
    tertiary: '#58e7aa',
    onTertiary: '#003824',
    tertiaryContainer: '#33ca90',
    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    // Problem-space color (Scenes 1-2 only) — deliberately NOT a brand token,
    // represents the broken status quo, never the product itself.
    problemMuted: '#8a6a63',
    problemMutedDim: '#5c4844',
  },
  font: {
    sans: 'Inter',
    mono: 'JetBrains Mono',
  },
  radius: {
    sm: 2,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
  motion: {
    entranceFrames: 18, // ~0.6s @ 30fps
    exitFrames: 12,
    easeOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
    cameraPushPx: 40,
    transitionFrames: 15,
  },
} as const;

export type Theme = typeof theme;
