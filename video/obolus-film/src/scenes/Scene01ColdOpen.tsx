import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Scene} from '../components/Scene';
import {SafeArea} from '../components/SafeArea';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene01ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const {duration} = sceneFrames('Cold Open');
  const countdown = interpolate(frame, [0, duration], [90, 62], {extrapolateRight: 'clamp'});
  const days = Math.floor(countdown);

  return (
    <Scene durationInFrames={duration} background={theme.colors.surfaceContainerLowest} fadeOutFrames={4}>
      <SafeArea>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28}}>
          <div
            style={{
              fontFamily: theme.font.mono,
              fontSize: 140,
              fontWeight: 700,
              color: theme.colors.problemMuted,
              letterSpacing: '-0.02em',
            }}
          >
            {days}
          </div>
          <div
            style={{
              fontFamily: theme.font.sans,
              fontSize: 20,
              letterSpacing: '0.1em',
              color: theme.colors.outline,
              textTransform: 'uppercase',
            }}
          >
            days of silence
          </div>
        </div>
      </SafeArea>
      <div style={{position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center'}}>
        <KineticText size={30} weight={700} color={theme.colors.problemMuted} align="center" delay={6}>
          SILENCE ≠ DEATH
        </KineticText>
      </div>
    </Scene>
  );
};
