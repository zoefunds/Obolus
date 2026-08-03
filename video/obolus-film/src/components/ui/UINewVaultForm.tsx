import React from 'react';
import {theme} from '../../theme';

const Field: React.FC<{label: string; value: string; hint?: string; filled: boolean}> = ({
  label,
  value,
  hint,
  filled,
}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap: 6, flex: 1}}>
    <div style={{fontFamily: theme.font.mono, fontSize: 11, letterSpacing: '0.08em', color: theme.colors.outline, textTransform: 'uppercase'}}>
      {label}
    </div>
    <div
      style={{
        background: theme.colors.surfaceContainerLow,
        border: `1px solid ${theme.colors.surfaceContainerHigh}`,
        borderRadius: theme.radius.md,
        padding: '14px 16px',
        fontFamily: theme.font.mono,
        fontSize: 16,
        color: filled ? theme.colors.onSurface : theme.colors.outline,
        minHeight: 20,
      }}
    >
      {value}
    </div>
    {hint && <div style={{fontFamily: theme.font.sans, fontSize: 12, color: theme.colors.outline}}>{hint}</div>}
  </div>
);

// Faithful reconstruction of the real New Vault creation screen.
export const UINewVaultForm: React.FC<{
  beneficiary: string;
  subjectName: string;
  contestWindow: string;
  genAmount: string;
}> = ({beneficiary, subjectName, contestWindow, genAmount}) => {
  return (
    <div style={{background: theme.colors.surface, padding: 40, display: 'flex', flexDirection: 'column', gap: 22}}>
      <div>
        <div style={{fontFamily: theme.font.sans, fontSize: 26, fontWeight: 700, color: theme.colors.primary}}>
          Create a Vault
        </div>
        <div style={{fontFamily: theme.font.sans, fontSize: 14, color: theme.colors.onSurfaceVariant, marginTop: 6}}>
          Lock GEN for a beneficiary, naming the subject whose death must be evidenced to release it.
        </div>
      </div>
      <Field label="Beneficiary Address" value={beneficiary} hint="Must differ from your own address." filled={!!beneficiary} />
      <div style={{display: 'flex', gap: 20}}>
        <Field label="Subject Name" value={subjectName} hint="Whose death must be evidenced — usually yourself." filled={!!subjectName} />
        <Field label="Birth Year (optional)" value="" filled={false} />
      </div>
      <div style={{display: 'flex', gap: 20}}>
        <Field label="Contest Window" value={contestWindow} hint="Between 1 and 180 days." filled />
        <Field label="GEN to Escrow" value={genAmount} filled={!!genAmount} />
      </div>
    </div>
  );
};
