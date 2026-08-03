import React from 'react';
import {theme} from '../../theme';

const StatusBadge: React.FC<{label: string}> = ({label}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      borderRadius: theme.radius.full,
      background: 'rgba(242,202,80,0.12)',
      border: `1px solid ${theme.colors.primary}`,
      fontFamily: theme.font.mono,
      fontSize: 13,
      color: theme.colors.primary,
      letterSpacing: '0.04em',
    }}
  >
    <div style={{width: 6, height: 6, borderRadius: 999, background: theme.colors.primary}} />
    {label}
  </div>
);

// Faithful reconstruction of the real Vault #2 detail screen (Jaden Jason, CLAIM_PENDING).
export const UIVaultDetail: React.FC<{
  showCounterEvidenceHighlight?: boolean;
  showCountdownFocus?: boolean;
}> = ({showCounterEvidenceHighlight, showCountdownFocus}) => {
  return (
    <div style={{background: theme.colors.surface, padding: 40, display: 'flex', gap: 32}}>
      <div style={{flex: 2, display: 'flex', flexDirection: 'column', gap: 20}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
          <div>
            <div style={{fontFamily: theme.font.sans, fontSize: 28, fontWeight: 700, color: theme.colors.onSurface}}>
              Jaden Jason
            </div>
            <div style={{fontFamily: theme.font.sans, fontSize: 13, color: theme.colors.outline, marginTop: 4}}>
              Escrow vault #2 · Contest window: 1 day
            </div>
          </div>
          <StatusBadge label="CLAIM_PENDING" />
        </div>

        <div
          style={{
            background: theme.colors.surfaceContainer,
            border: `1px solid ${theme.colors.surfaceContainerHigh}`,
            borderRadius: theme.radius.lg,
            padding: 24,
          }}
        >
          <div style={{fontFamily: theme.font.mono, fontSize: 11, color: theme.colors.outline, letterSpacing: '0.08em'}}>
            VAULT BALANCE
          </div>
          <div style={{fontFamily: theme.font.sans, fontSize: 40, fontWeight: 700, color: theme.colors.primary, marginTop: 6}}>
            10000 GEN
          </div>
        </div>

        <div
          style={{
            background: theme.colors.surfaceContainer,
            border: `1px solid ${theme.colors.surfaceContainerHigh}`,
            borderRadius: theme.radius.lg,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{fontFamily: theme.font.sans, fontSize: 18, fontWeight: 700, color: theme.colors.onSurface}}>
            Active Claim
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
            <div style={{fontFamily: theme.font.sans, fontSize: 15, fontWeight: 600, color: theme.colors.secondary}}>
              ✓ Claim Submitted
            </div>
          </div>
          <div
            style={{
              transform: showCountdownFocus ? 'scale(1.08)' : 'scale(1)',
              transformOrigin: 'left center',
            }}
          >
            <div style={{fontFamily: theme.font.sans, fontSize: 15, fontWeight: 700, color: theme.colors.primary}}>
              ⏱ Contest Window
            </div>
            <div style={{fontFamily: theme.font.mono, fontSize: 22, color: theme.colors.onSurface, marginTop: 2}}>
              Ends in 23H 55M 41S
            </div>
          </div>
          <div
            style={{
              background: theme.colors.surfaceContainerLow,
              border: `1px solid ${theme.colors.surfaceContainerHigh}`,
              borderRadius: theme.radius.md,
              padding: 16,
              fontFamily: theme.font.sans,
              fontSize: 14,
              color: theme.colors.onSurfaceVariant,
              lineHeight: 1.5,
            }}
          >
            Vault assets are frozen. Anyone with counter-evidence may submit a contest before the window closes.
          </div>
        </div>
      </div>

      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 16}}>
        <div
          style={{
            background: theme.colors.surfaceContainer,
            border: `1px solid ${theme.colors.surfaceContainerHigh}`,
            borderRadius: theme.radius.lg,
            padding: 20,
          }}
        >
          <div style={{fontFamily: theme.font.mono, fontSize: 11, color: theme.colors.outline, letterSpacing: '0.08em', marginBottom: 10}}>
            VAULT PARTICIPANTS
          </div>
          <div style={{fontFamily: theme.font.sans, fontSize: 12, color: theme.colors.outline}}>GRANTOR</div>
          <div style={{fontFamily: theme.font.mono, fontSize: 14, color: theme.colors.onSurface, marginBottom: 10}}>0x6f0b...698a</div>
          <div style={{fontFamily: theme.font.sans, fontSize: 12, color: theme.colors.outline}}>BENEFICIARY</div>
          <div style={{fontFamily: theme.font.mono, fontSize: 14, color: theme.colors.secondary}}>0x7401...58Eb</div>
        </div>
        <div
          style={{
            background: showCounterEvidenceHighlight ? 'rgba(123,208,255,0.1)' : theme.colors.surfaceContainer,
            border: `1px solid ${showCounterEvidenceHighlight ? theme.colors.secondary : theme.colors.surfaceContainerHigh}`,
            borderRadius: theme.radius.lg,
            padding: 20,
          }}
        >
          <div style={{fontFamily: theme.font.mono, fontSize: 11, color: theme.colors.outline, letterSpacing: '0.08em', marginBottom: 10}}>
            ACTIONS
          </div>
          <div
            style={{
              border: `1px solid ${theme.colors.secondary}`,
              borderRadius: theme.radius.md,
              padding: '12px 16px',
              fontFamily: theme.font.sans,
              fontSize: 14,
              fontWeight: 600,
              color: theme.colors.secondary,
              textAlign: 'center',
            }}
          >
            Submit Counter-Evidence
          </div>
        </div>
      </div>
    </div>
  );
};
