import * as React from 'react';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'warning';
};

export function Badge({ variant = 'default', style, ...props }: BadgeProps): React.ReactElement {
  const warning = variant === 'warning';
  return <span {...props} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, gap: 5, padding: '0 11px', border: `1px solid ${warning ? 'rgba(255,174,61,.32)' : 'rgba(255,255,255,.13)'}`, borderRadius: 999, background: warning ? 'rgba(89,50,14,.72)' : 'rgba(14,12,15,.58)', color: warning ? '#ffd086' : '#fff', font: '600 13px Roboto,Arial,sans-serif', letterSpacing: '.1px', ...style }} />;
}
