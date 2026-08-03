import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

// Base wrapper: background fill + simple crossfade in/out at scene boundaries.
export const Scene: React.FC<{
  children: React.ReactNode;
  background?: string;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  durationInFrames: number;
}> = ({children, background = theme.colors.background, fadeInFrames = 10, fadeOutFrames = 10, durationInFrames}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill style={{background}}>
      <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
