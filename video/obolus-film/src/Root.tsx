import React from 'react';
import {Composition} from 'remotion';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {Film} from './Film';
import {TOTAL_DURATION_FRAMES, FPS} from './timings';

loadInter();
loadMono();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Landscape"
        component={Film}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Vertical"
        component={Film}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="Square"
        component={Film}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1080}
      />
      <Composition
        id="Teaser"
        component={Film}
        durationInFrames={25 * FPS}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
