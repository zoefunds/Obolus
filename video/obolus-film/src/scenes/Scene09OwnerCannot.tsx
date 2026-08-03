import React from 'react';
import {Scene} from '../components/Scene';
import {BrowserFrame} from '../components/BrowserFrame';
import {UIAdminPanel} from '../components/ui/UIAdminPanel';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';
import {useCurrentFrame} from 'remotion';

export const Scene09OwnerCannot: React.FC = () => {
  const {duration} = sceneFrames('Owner Cannot Move Funds');
  const frame = useCurrentFrame();

  return (
    <Scene durationInFrames={duration}>
      <BrowserFrame scale={0.96}>
        <UIAdminPanel highlightSentence={frame > 40} />
      </BrowserFrame>
      <div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center'}}>
        <KineticText size={26} weight={700} color={theme.colors.primary} align="center" delay={65}>
          OWNER CANNOT MOVE FUNDS.
        </KineticText>
      </div>
    </Scene>
  );
};
