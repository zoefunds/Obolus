import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {Wordmark} from './Logo';

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const line = (delay: number) =>
    interpolate(frame, [delay, delay + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: theme.colors.background,
      }}
    >
      <div style={{opacity: line(0)}}>
        <Wordmark size={64} />
      </div>
      <div
        style={{
          opacity: line(10),
          fontFamily: theme.font.sans,
          fontSize: 20,
          color: theme.colors.onSurfaceVariant,
          textAlign: 'center',
        }}
      >
        an evidence-verified inheritance escrow on GenLayer
      </div>
      <div
        style={{
          opacity: line(20),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
        }}
      >
        <div style={{fontFamily: theme.font.mono, fontSize: 18, color: theme.colors.secondary}}>
          obolus-app.vercel.app
        </div>
        <div style={{fontFamily: theme.font.mono, fontSize: 14, color: theme.colors.outline}}>
          Contract: 0x1095...f0b94 — GenLayer StudioNet
        </div>
      </div>
      <div
        style={{
          opacity: line(30),
          fontFamily: theme.font.sans,
          fontSize: 13,
          color: theme.colors.outline,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginTop: 8,
        }}
      >
        Built on GenLayer
      </div>
    </div>
  );
};
