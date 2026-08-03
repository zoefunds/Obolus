import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

export const MetricReveal: React.FC<{
  label: string;
  detail: string;
  accent: string;
  delay: number;
}> = ({label, detail, accent, delay}) => {
  const frame = useCurrentFrame();
  const local = frame - delay;
  const opacity = interpolate(local, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = interpolate(local, [0, 15], [0.94, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        width: 320,
        padding: 28,
        borderRadius: theme.radius.lg,
        background: theme.colors.surfaceContainer,
        border: `1px solid ${theme.colors.surfaceContainerHigh}`,
        borderTop: `3px solid ${accent}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{fontFamily: theme.font.mono, fontSize: 26, fontWeight: 700, color: accent}}>{label}</div>
      <div style={{fontFamily: theme.font.sans, fontSize: 15, color: theme.colors.onSurfaceVariant, lineHeight: 1.4}}>
        {detail}
      </div>
    </div>
  );
};
