import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export const BrowserFrame: React.FC<{
  children: React.ReactNode;
  scale?: number;
  entrance?: 'push' | 'none';
}> = ({children, scale = 1, entrance = 'push'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const s = entrance === 'push' ? interpolate(enter, [0, 1], [0.96, 1]) * scale : scale;
  const o = entrance === 'push' ? enter : 1;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: o,
      }}
    >
      <div
        style={{
          transform: `scale(${s})`,
          width: '86%',
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
          border: `1px solid ${theme.colors.surfaceContainerHigh}`,
          background: theme.colors.surface,
        }}
      >
        {/* window chrome bar */}
        <div
          style={{
            height: 32,
            background: theme.colors.surfaceContainerLowest,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            borderBottom: `1px solid ${theme.colors.surfaceContainerHigh}`,
          }}
        >
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{width: 10, height: 10, borderRadius: 999, background: c, opacity: 0.85}} />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
};
