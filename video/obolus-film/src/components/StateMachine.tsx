import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

export const StateMachine: React.FC<{
  states: string[];
  activeIndex: number; // which state is currently "lit"
  revealStartFrame: number;
  frameGap?: number;
}> = ({states, activeIndex, revealStartFrame, frameGap = 10}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 0}}>
      {states.map((s, i) => {
        const localStart = revealStartFrame + i * frameGap;
        const opacity = interpolate(frame, [localStart, localStart + 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const isActive = i <= activeIndex && frame >= localStart;
        return (
          <React.Fragment key={s}>
            <div
              style={{
                opacity,
                padding: '10px 18px',
                borderRadius: theme.radius.md,
                fontFamily: theme.font.mono,
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: '0.03em',
                background: isActive ? theme.colors.surfaceContainerHigh : theme.colors.surfaceContainerLow,
                color: isActive ? theme.colors.primary : theme.colors.outline,
                border: `1px solid ${isActive ? theme.colors.primary : theme.colors.surfaceContainerHigh}`,
                whiteSpace: 'nowrap',
              }}
            >
              {s}
            </div>
            {i < states.length - 1 && (
              <div
                style={{
                  opacity,
                  width: 28,
                  height: 1,
                  background: theme.colors.outlineVariant,
                  margin: '0 4px',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
