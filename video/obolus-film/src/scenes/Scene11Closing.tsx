import React from 'react';
import {Scene} from '../components/Scene';
import {KineticText} from '../components/KineticText';
import {EndCard} from '../components/EndCard';
import {theme} from '../theme';
import {sceneFrames} from '../timings';
import {SafeArea} from '../components/SafeArea';
import {useCurrentFrame} from 'remotion';

export const Scene11Closing: React.FC = () => {
  const {duration} = sceneFrames('Closing');
  const frame = useCurrentFrame();
  const showEndCard = frame > duration * 0.45;

  return (
    <Scene durationInFrames={duration} fadeOutFrames={20}>
      {!showEndCard ? (
        <SafeArea>
          <KineticText size={34} weight={700} color={theme.colors.onSurface} align="center" delay={4}>
            PROOF, NOT A PROMISE.
          </KineticText>
        </SafeArea>
      ) : (
        <EndCard />
      )}
    </Scene>
  );
};
