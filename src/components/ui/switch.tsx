import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export function Switch({ checked, style, ...props }: SwitchProps): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      {...props}
      style={{ width: 48, height: 28, border: 0, borderRadius: 999, padding: 2, background: checked ? 'rgba(255,255,255,.36)' : 'rgba(0,0,0,.48)', cursor: 'pointer', transition: 'background 160ms ease', ...style }}
    >
      <SwitchPrimitive.Thumb style={{ display: 'block', width: 24, height: 24, borderRadius: '50%', background: checked ? '#fff' : '#c9c9c9', boxShadow: '0 1px 3px rgba(0,0,0,.45)', transform: checked ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 160ms ease, background 160ms ease' }} />
    </SwitchPrimitive.Root>
  );
}
