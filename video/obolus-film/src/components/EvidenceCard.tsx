import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

export const EvidenceCard: React.FC<{
  children: React.ReactNode;
  delay?: number;
  accent?: string;
  width?: number | string;
}> = ({children, delay = 0, accent = theme.colors.primary, width = 640}) => {
  const frame = useCurrentFrame();
  const local = frame - delay;
  const opacity = interpolate(local, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const translateY = interpolate(local, [0, 12], [10, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        width,
        background: theme.colors.surfaceContainer,
        border: `1px solid ${theme.colors.surfaceContainerHigh}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: theme.radius.md,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
};
