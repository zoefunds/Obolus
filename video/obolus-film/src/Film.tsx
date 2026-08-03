import React from 'react';
import {AbsoluteFill, Series, Audio, staticFile} from 'remotion';
import {theme} from './theme';
import {sceneFrames} from './timings';
import {CaptionLine} from './components/CaptionLine';

import {Scene01ColdOpen} from './scenes/Scene01ColdOpen';
import {Scene02BrokenMechanisms} from './scenes/Scene02BrokenMechanisms';
import {Scene03Reveal} from './scenes/Scene03Reveal';
import {Scene04VaultCreation} from './scenes/Scene04VaultCreation';
import {Scene05ClaimSubmitted} from './scenes/Scene05ClaimSubmitted';
import {Scene06ContestWindow} from './scenes/Scene06ContestWindow';
import {Scene07Mechanism} from './scenes/Scene07Mechanism';
import {Scene08ThreeOutcomes} from './scenes/Scene08ThreeOutcomes';
import {Scene09OwnerCannot} from './scenes/Scene09OwnerCannot';
import {Scene10Ecosystem} from './scenes/Scene10Ecosystem';
import {Scene11Closing} from './scenes/Scene11Closing';

// Caption text matches VOICEOVER_SCRIPT.md verbatim (pause markers stripped).
const CAPTIONS: {text: string; scene: Parameters<typeof sceneFrames>[0]}[] = [
  {text: 'Ninety days of silence. Is that a death — or a vacation?', scene: 'Cold Open'},
  {
    text: "Digital inheritance today runs on a timer, or on one person's word.",
    scene: 'Two Broken Mechanisms',
  },
  {text: 'Obolus asks for proof instead.', scene: 'Product Reveal'},
  {
    text: 'A grantor locks GEN in a vault — names who receives it, and whose death has to be proven to release it.',
    scene: 'Vault Creation',
  },
  {text: 'Anyone can submit a death claim — evidence, and a bond as skin in the game.', scene: 'Claim Submitted'},
  {
    text: 'Vault assets freeze. Anyone with counter-evidence has a real window to speak before judgment runs.',
    scene: 'Contest Window',
  },
  {
    text: "Validators fetch every URL live, reason independently, and must agree exactly — only high confidence moves money.",
    scene: 'Mechanism',
  },
  {
    text: 'Confirmed pays out. Refuted slashes the claim. Inconclusive returns everything — abstention is the default.',
    scene: 'Three Outcomes',
  },
  {
    text: 'The owner can pause new activity. They cannot touch a vault, block a resolution, or stop a withdrawal.',
    scene: 'Owner Cannot Move Funds',
  },
  {
    text: "This only works on a chain that can read the open web and reach judgment under consensus. That's GenLayer.",
    scene: 'Ecosystem',
  },
  {text: 'A death is a fact, not a feeling. Obolus moves money only when the evidence is willing to say so.', scene: 'Closing'},
];

// Audio is currently disabled: Higgsfield voiceover generation failed with
// Voiceover generated via Higgsfield (seed_audio, voice "Marcus"), 104.24s — matches
// the 105s timeline almost exactly. No music track exists: this workspace's
// generate_audio only exposes speech models: no standalone music-generation model was
// available (confirmed via its model catalog). See ASSET_MANIFEST.md for that gap.
const AUDIO_ENABLED = true;

export const Film: React.FC = () => {
  return (
    <AbsoluteFill style={{background: theme.colors.background, fontFamily: theme.font.sans}}>
      {AUDIO_ENABLED && <Audio src={staticFile('audio/voiceover.wav')} />}

      <Series>
        <Series.Sequence durationInFrames={sceneFrames('Cold Open').duration}>
          <Scene01ColdOpen />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Two Broken Mechanisms').duration}>
          <Scene02BrokenMechanisms />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Product Reveal').duration}>
          <Scene03Reveal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Vault Creation').duration}>
          <Scene04VaultCreation />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Claim Submitted').duration}>
          <Scene05ClaimSubmitted />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Contest Window').duration}>
          <Scene06ContestWindow />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Mechanism').duration}>
          <Scene07Mechanism />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Three Outcomes').duration}>
          <Scene08ThreeOutcomes />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Owner Cannot Move Funds').duration}>
          <Scene09OwnerCannot />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Ecosystem').duration}>
          <Scene10Ecosystem />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sceneFrames('Closing').duration}>
          <Scene11Closing />
        </Series.Sequence>
      </Series>

      {CAPTIONS.map((c, i) => {
        const {start, end} = sceneFrames(c.scene);
        return <CaptionLine key={i} text={c.text} startFrame={start} endFrame={end - 4} />;
      })}
    </AbsoluteFill>
  );
};
