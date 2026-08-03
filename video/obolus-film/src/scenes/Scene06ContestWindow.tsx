import React from 'react';
import {Scene} from '../components/Scene';
import {BrowserFrame} from '../components/BrowserFrame';
import {UIVaultDetail} from '../components/ui/UIVaultDetail';
import {FocusZoom} from '../components/FocusZoom';
import {KineticText} from '../components/KineticText';
import {theme} from '../theme';
import {sceneFrames} from '../timings';

export const Scene06ContestWindow: React.FC = () => {
  const {duration} = sceneFrames('Contest Window');

  return (
    <Scene durationInFrames={duration}>
      <FocusZoom originX="60%" originY="55%" startFrame={0} holdFrame={40} maxScale={1.7}>
        <BrowserFrame entrance="none">
          <UIVaultDetail showCountdownFocus showCounterEvidenceHighlight />
        </BrowserFrame>
      </FocusZoom>
      <div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center'}}>
        <KineticText size={26} weight={700} color={theme.colors.secondary} align="center" delay={65}>
          23H 55M 41S TO CONTEST
        </KineticText>
      </div>
    </Scene>
  );
};
