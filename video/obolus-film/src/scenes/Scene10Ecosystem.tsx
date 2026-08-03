import React from 'react';
import {Scene} from '../components/Scene';
import {EvidenceCard} from '../components/EvidenceCard';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';
import {SafeArea} from '../components/SafeArea';

export const Scene10Ecosystem: React.FC = () => {
  const {duration} = sceneFrames('Ecosystem');

  return (
    <Scene durationInFrames={duration}>
      <SafeArea>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24}}>
          <KineticText size={30} weight={700} color={theme.colors.onSurface} align="center" delay={4}>
            BUILT ON GENLAYER. LIVE ON STUDIONET.
          </KineticText>
          <EvidenceCard delay={30} accent={theme.colors.primary} width={520}>
            <div style={{fontFamily: theme.font.mono, fontSize: 13, color: theme.colors.outline, marginBottom: 6}}>
              CONTRACT ADDRESS
            </div>
            <div style={{fontFamily: theme.font.mono, fontSize: 18, color: theme.colors.secondary, wordBreak: 'break-all'}}>
              0x1095394019722dE39b0E66D39d05f4dfC67f0b94
            </div>
            <div style={{fontFamily: theme.font.sans, fontSize: 13, color: theme.colors.outline, marginTop: 10}}>
              GenLayer StudioNet — testnet, live today
            </div>
          </EvidenceCard>
        </div>
      </SafeArea>
    </Scene>
  );
};
