import React from 'react';
import {Scene} from '../components/Scene';
import {ArchitectureFlow} from '../components/ArchitectureFlow';
import {StateMachine} from '../components/StateMachine';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';
import {SafeArea} from '../components/SafeArea';
import {useCurrentFrame, interpolate} from 'remotion';

export const Scene07Mechanism: React.FC = () => {
  const {duration} = sceneFrames('Mechanism');
  const frame = useCurrentFrame();

  const captionStage =
    frame < 60 ? 0 : frame < 120 ? 1 : frame < 180 ? 2 : 3;

  const captions = [
    'FETCHED LIVE.',
    'JUDGED INDEPENDENTLY.',
    'MUST AGREE EXACTLY.',
    '',
  ];

  const stageStart = captionStage * 60;
  const captionOpacity = interpolate(frame, [stageStart, stageStart + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <Scene durationInFrames={duration}>
      <SafeArea padding={64}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 48, alignItems: 'center'}}>
          <ArchitectureFlow
            revealStartFrame={4}
            frameGap={26}
            nodes={[
              {label: 'Evidence URLs', sublabel: 'submitted by claimant'},
              {label: 'Live Fetch', sublabel: 'gl.nondet.web.render / .get', color: theme.colors.secondary},
              {label: 'Validators Reason', sublabel: 'gl.nondet.exec_prompt', color: theme.colors.secondary},
              {label: 'Consensus Check', sublabel: 'gl.eq_principle.prompt_comparative', color: theme.colors.primary},
              {label: 'Verdict', color: theme.colors.primary},
            ]}
          />
          <StateMachine
            states={['SUBMITTED', 'EVIDENCE FETCHED', 'VALIDATED', 'RESOLVED']}
            activeIndex={3}
            revealStartFrame={130}
            frameGap={14}
          />
        </div>
      </SafeArea>
      <div style={{position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center', opacity: captionOpacity}}>
        <KineticText size={30} weight={700} color={theme.colors.onSurface} align="center">
          {captions[captionStage]}
        </KineticText>
      </div>
    </Scene>
  );
};
