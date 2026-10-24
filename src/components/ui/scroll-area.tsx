import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>;

export function ScrollArea({ children, style, ...props }: ScrollAreaProps): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Root {...props} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <ScrollAreaPrimitive.Viewport style={{ width: '100%', height: '100%', borderRadius: 'inherit' }}>{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar orientation="vertical" style={{ display: 'flex', width: 10, padding: 2, background: 'transparent', touchAction: 'none', userSelect: 'none' }}>
        <ScrollAreaPrimitive.Thumb style={{ flex: 1, borderRadius: 999, background: 'rgba(255,255,255,.62)' }} />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
