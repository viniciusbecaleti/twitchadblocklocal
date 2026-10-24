import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export function Switch({ checked, style, ...props }: SwitchProps): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      {...props}
      style={{ width: 38, height: 22, border: 0, borderRadius: 999, padding: 0, background: checked ? '#fff' : '#5f6368', cursor: 'pointer', transition: 'background 160ms ease', ...style }}
    >
      <SwitchPrimitive.Thumb style={{ display: 'block', width: 16, height: 16, borderRadius: '50%', background: checked ? '#000' : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.45)', transform: checked ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 160ms ease, background 160ms ease' }} />
    </SwitchPrimitive.Root>
  );
}
