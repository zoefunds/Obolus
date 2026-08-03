import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

// Elegant phrase-level caption for the landscape master (per brief: two lines max,
// not hyperactive word-by-word — that style is reserved for vertical social cuts).
export const CaptionLine: React.FC<{
  text: string;
  startFrame: number;
  endFrame: number;
}> = ({text, startFrame, endFrame}) => {
  const frame = useCurrentFrame();
  if (frame < startFrame || frame > endFrame) return null;

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 6, endFrame - 6, endFrame],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: '70%',
          textAlign: 'center',
          fontFamily: theme.font.sans,
          fontSize: 22,
          fontWeight: 500,
          color: theme.colors.onSurface,
          background: 'rgba(10,11,13,0.55)',
          padding: '10px 20px',
          borderRadius: theme.radius.md,
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>
    </div>
  );
};
