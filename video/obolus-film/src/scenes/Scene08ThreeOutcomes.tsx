import React from 'react';
import {Scene} from '../components/Scene';
import {MetricReveal} from '../components/MetricReveal';
import {theme} from '../theme';
import {sceneFrames} from '../timings';
import {SafeArea} from '../components/SafeArea';

export const Scene08ThreeOutcomes: React.FC = () => {
  const {duration} = sceneFrames('Three Outcomes');

  return (
    <Scene durationInFrames={duration}>
      <SafeArea>
        <div style={{display: 'flex', gap: 28}}>
          <MetricReveal
            label="CONFIRMED"
            detail="Vault balance → beneficiary. Claimant's bond returned."
            accent={theme.colors.tertiary}
            delay={4}
          />
          <MetricReveal
            label="REFUTED"
            detail="Claimant's bond forfeited into vault. Contester returned."
            accent={theme.colors.error}
            delay={22}
          />
          <MetricReveal
            label="INCONCLUSIVE"
            detail="Nothing moves. Every bond returned. Not a failure — the default."
            accent={theme.colors.outline}
            delay={44}
          />
        </div>
      </SafeArea>
    </Scene>
  );
};
