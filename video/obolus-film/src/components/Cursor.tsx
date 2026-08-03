import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

export const Cursor: React.FC<{
  from: [number, number];
  to: [number, number];
  startFrame: number;
  durationFrames?: number;
  clickAt?: number;
}> = ({from, to, startFrame, durationFrames = 20, clickAt}) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const progress = interpolate(local, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const x = interpolate(progress, [0, 1], [from[0], to[0]]);
  const y = interpolate(progress, [0, 1], [from[1], to[1]]);

  const showPulse = clickAt !== undefined && local >= clickAt && local < clickAt + 15;
  const pulseScale = showPulse ? interpolate(local - clickAt, [0, 15], [0.4, 2]) : 0;
  const pulseOpacity = showPulse ? interpolate(local - clickAt, [0, 15], [0.6, 0]) : 0;

  return (
    <div style={{position: 'absolute', left: x, top: y, pointerEvents: 'none'}}>
      {showPulse && (
        <div
          style={{
            position: 'absolute',
            left: -20,
            top: -20,
            width: 40,
            height: 40,
            borderRadius: 999,
            border: `2px solid ${theme.colors.primary}`,
            transform: `scale(${pulseScale})`,
            opacity: pulseOpacity,
          }}
        />
      )}
      <svg width="22" height="22" viewBox="0 0 22 22" style={{filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'}}>
        <path d="M2 2 L2 18 L7 14 L10 20 L13 18.5 L10 12.5 L16 12.5 Z" fill="white" stroke="black" strokeWidth="1" />
      </svg>
    </div>
  );
};
