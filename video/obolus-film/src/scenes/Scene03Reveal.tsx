import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Scene} from '../components/Scene';
import {Wordmark} from '../components/Logo';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene03Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {duration} = sceneFrames('Product Reveal');
  const settle = spring({frame, fps, config: {damping: 14, mass: 0.7, stiffness: 120}});

  return (
    <Scene durationInFrames={duration} background={theme.colors.background} fadeInFrames={2}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${0.9 + settle * 0.1})`,
          opacity: Math.min(settle, 1),
        }}
      >
        <Wordmark size={72} />
      </div>
    </Scene>
  );
};
