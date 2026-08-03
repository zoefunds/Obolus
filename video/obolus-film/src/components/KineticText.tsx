import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export const KineticText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  weight?: number;
  color?: string;
  mono?: boolean;
  letterSpacing?: string;
  align?: 'left' | 'center' | 'right';
}> = ({
  children,
  delay = 0,
  size = 48,
  weight = 600,
  color = theme.colors.onSurface,
  mono = false,
  letterSpacing = '-0.01em',
  align = 'left',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const localFrame = frame - delay;

  const progress = spring({
    frame: localFrame,
    fps,
    config: {damping: 200, mass: 0.6, stiffness: 120},
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [16, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontFamily: mono ? theme.font.mono : theme.font.sans,
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing,
        textAlign: align,
        lineHeight: 1.15,
      }}
    >
      {children}
    </div>
  );
};
