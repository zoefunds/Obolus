import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Scene} from '../components/Scene';
import {BrowserFrame} from '../components/BrowserFrame';
import {UINewVaultForm} from '../components/ui/UINewVaultForm';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene04VaultCreation: React.FC = () => {
  const frame = useCurrentFrame();
  const {duration} = sceneFrames('Vault Creation');

  const beneficiary = frame > 20 ? '0x6f0b...1a4c' : '';
  const subjectName = frame > 45 ? 'Jane Doe' : '';
  const contestWindow = '30 days';
  const genAmount = frame > 70 ? '10,000.00 GEN' : '';

  return (
    <Scene durationInFrames={duration}>
      <BrowserFrame>
        <UINewVaultForm
          beneficiary={beneficiary}
          subjectName={subjectName}
          contestWindow={contestWindow}
          genAmount={genAmount}
        />
      </BrowserFrame>
      <div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center'}}>
        <KineticText size={26} weight={700} color={theme.colors.primary} align="center" delay={95}>
          NAME WHO. NAME WHOSE DEATH.
        </KineticText>
      </div>
    </Scene>
  );
};
