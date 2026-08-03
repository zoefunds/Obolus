import React from 'react';
import {theme} from '../theme';

// Recreation of the Obolus mark (coin + upward arrow, per frontend/public/favicon.svg
// concept — a coin motif, gold on dark) rendered as inline SVG so it scales cleanly at 4K.
export const Logo: React.FC<{size?: number}> = ({size = 64}) => {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="30" stroke={theme.colors.primary} strokeWidth="3" fill={theme.colors.surfaceContainerLowest} />
      <path
        d="M32 44V20M32 20L23 29M32 20L41 29"
        stroke={theme.colors.primary}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const Wordmark: React.FC<{size?: number; showMark?: boolean}> = ({size = 56, showMark = true}) => {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
      {showMark && <Logo size={size} />}
      <span
        style={{
          fontFamily: theme.font.sans,
          fontSize: size,
          fontWeight: 700,
          color: theme.colors.primary,
          letterSpacing: '-0.02em',
        }}
      >
        Obolus
      </span>
    </div>
  );
};
