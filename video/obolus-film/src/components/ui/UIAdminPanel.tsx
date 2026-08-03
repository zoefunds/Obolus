import React from 'react';
import {theme} from '../../theme';

// Faithful reconstruction of the real Admin panel, focused on the pause-limits sentence.
export const UIAdminPanel: React.FC<{highlightSentence?: boolean}> = ({highlightSentence}) => {
  return (
    <div style={{background: theme.colors.surface, padding: 40, display: 'flex', flexDirection: 'column', gap: 22}}>
      <div>
        <div style={{fontFamily: theme.font.sans, fontSize: 26, fontWeight: 700, color: theme.colors.onSurface}}>
          Platform Administration
        </div>
        <div style={{fontFamily: theme.font.sans, fontSize: 13, color: theme.colors.outline, marginTop: 4}}>
          Current owner: <span style={{fontFamily: theme.font.mono, color: theme.colors.onSurfaceVariant}}>0x7401...58Eb</span>
        </div>
      </div>
      <div
        style={{
          background: theme.colors.surfaceContainer,
          border: `1px solid ${theme.colors.surfaceContainerHigh}`,
          borderRadius: theme.radius.lg,
          padding: 24,
        }}
      >
        <div style={{fontFamily: theme.font.sans, fontSize: 18, fontWeight: 700, color: theme.colors.onSurface, marginBottom: 12}}>
          Platform pause
        </div>
        <div
          style={{
            fontFamily: theme.font.sans,
            fontSize: 16,
            lineHeight: 1.6,
            color: highlightSentence ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
            background: highlightSentence ? 'rgba(242,202,80,0.1)' : 'transparent',
            padding: highlightSentence ? '10px 14px' : 0,
            borderLeft: highlightSentence ? `3px solid ${theme.colors.primary}` : 'none',
            borderRadius: highlightSentence ? theme.radius.sm : 0,
          }}
        >
          Halts new vaults, funding, claims, and contests. Never blocks{' '}
          <span style={{fontFamily: theme.font.mono, color: theme.colors.secondary}}>resolve_claim</span> or{' '}
          <span style={{fontFamily: theme.font.mono, color: theme.colors.secondary}}>withdraw</span> — funds
          already at stake stay resolvable and withdrawable.
        </div>
      </div>
    </div>
  );
};
