import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Scene} from '../components/Scene';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene02BrokenMechanisms: React.FC = () => {
  const frame = useCurrentFrame();
  const {duration} = sceneFrames('Two Broken Mechanisms');
  const collapse = interpolate(frame, [duration - 14, duration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <Scene durationInFrames={duration} background={theme.colors.surfaceContainerLowest} fadeInFrames={4} fadeOutFrames={4}>
      <div style={{display: 'flex', width: '100%', height: '100%'}}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            transform: `translateX(${collapse * 400}px)`,
          }}
        >
          <div style={{fontFamily: theme.font.mono, fontSize: 90, color: theme.colors.problemMuted, fontWeight: 700}}>62</div>
          <KineticText size={16} color={theme.colors.outline} align="center" delay={4}>
            INACTIVITY TIMER
          </KineticText>
        </div>
        <div style={{width: 1, background: theme.colors.surfaceContainerHigh}} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            transform: `translateX(${-collapse * 400}px)`,
          }}
        >
          <svg width="90" height="90" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke={theme.colors.problemMuted} strokeWidth="1.5" />
            <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" stroke={theme.colors.problemMuted} strokeWidth="1.5" />
          </svg>
          <KineticText size={16} color={theme.colors.outline} align="center" delay={4}>
            TRUSTED EXECUTOR
          </KineticText>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center', opacity: 1 - collapse}}>
        <KineticText size={26} weight={700} color={theme.colors.problemMuted} align="center" delay={20}>
          A TIMER CAN'T TELL THE DIFFERENCE
        </KineticText>
        <div style={{height: 12}} />
        <KineticText size={26} weight={700} color={theme.colors.problemMuted} align="center" delay={30}>
          NEITHER CAN ONE PERSON'S WORD
        </KineticText>
      </div>
    </Scene>
  );
};
