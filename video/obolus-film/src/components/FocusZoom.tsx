import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

// Pushes in on a specific origin point, then optionally pulls back out.
export const FocusZoom: React.FC<{
  children: React.ReactNode;
  originX: string; // e.g. '50%'
  originY: string;
  startFrame: number;
  holdFrame: number;
  endFrame?: number;
  maxScale?: number;
}> = ({children, originX, originY, startFrame, holdFrame, endFrame, maxScale = 1.5}) => {
  const frame = useCurrentFrame();

  let scale = 1;
  if (frame < startFrame) {
    scale = 1;
  } else if (frame < holdFrame) {
    scale = interpolate(frame, [startFrame, holdFrame], [1, maxScale], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (endFrame) {
    scale = interpolate(frame, [holdFrame, endFrame], [maxScale, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else {
    scale = maxScale;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        transform: `scale(${scale})`,
        transformOrigin: `${originX} ${originY}`,
      }}
    >
      {children}
    </div>
  );
};
