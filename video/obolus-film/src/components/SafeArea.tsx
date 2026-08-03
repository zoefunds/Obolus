import React from 'react';

// Keeps content within broadcast-safe margins across 16:9 / 9:16 / 1:1 exports.
export const SafeArea: React.FC<{children: React.ReactNode; padding?: number}> = ({
  children,
  padding = 96,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
};
