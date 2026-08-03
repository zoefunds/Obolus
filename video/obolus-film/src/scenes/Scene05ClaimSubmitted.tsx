import React from 'react';
import {Scene} from '../components/Scene';
import {BrowserFrame} from '../components/BrowserFrame';
import {UIVaultDetail} from '../components/ui/UIVaultDetail';
import {StateMachine} from '../components/StateMachine';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene05ClaimSubmitted: React.FC = () => {
  const {duration} = sceneFrames('Claim Submitted');

  return (
    <Scene durationInFrames={duration}>
      <BrowserFrame scale={0.94}>
        <UIVaultDetail />
      </BrowserFrame>
      <div style={{position: 'absolute', top: 60, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <StateMachine
          states={['ACTIVE', 'CLAIM_PENDING']}
          activeIndex={1}
          revealStartFrame={20}
        />
      </div>
      <div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center'}}>
        <KineticText size={26} weight={700} color={theme.colors.primary} align="center" delay={90}>
          A CLAIM. A BOND. A WINDOW OPENS.
        </KineticText>
      </div>
    </Scene>
  );
};
