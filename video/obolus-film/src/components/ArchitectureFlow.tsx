import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

type Node = {
  label: string;
  sublabel?: string;
  color?: string;
};

export const ArchitectureFlow: React.FC<{
  nodes: Node[];
  revealStartFrame: number;
  frameGap?: number;
}> = ({nodes, revealStartFrame, frameGap = 22}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0}}>
      {nodes.map((node, i) => {
        const localStart = revealStartFrame + i * frameGap;
        const progress = interpolate(frame, [localStart, localStart + 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const opacity = progress;
        const translateY = interpolate(progress, [0, 1], [14, 0]);

        return (
          <React.Fragment key={node.label}>
            <div
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minWidth: 210,
              }}
            >
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: theme.radius.lg,
                  background: theme.colors.surfaceContainer,
                  border: `1px solid ${node.color ?? theme.colors.outlineVariant}`,
                  color: theme.colors.onSurface,
                  fontFamily: theme.font.sans,
                  fontSize: 17,
                  fontWeight: 600,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                {node.label}
              </div>
              {node.sublabel && (
                <div
                  style={{
                    fontFamily: theme.font.mono,
                    fontSize: 12,
                    color: theme.colors.outline,
                  }}
                >
                  {node.sublabel}
                </div>
              )}
            </div>
            {i < nodes.length - 1 && (
              <div
                style={{
                  opacity,
                  width: 40,
                  height: 2,
                  background: `linear-gradient(90deg, ${theme.colors.outlineVariant}, ${theme.colors.primary})`,
                  margin: '0 4px',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
