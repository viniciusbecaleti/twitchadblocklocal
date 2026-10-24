import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

export function Slider({ style, ...props }: SliderProps): React.ReactElement {
  return (
    <SliderPrimitive.Root
      {...props}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 76, height: 20, touchAction: 'none', ...style }}
    >
      <SliderPrimitive.Track style={{ position: 'relative', flexGrow: 1, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.42)' }}>
        <SliderPrimitive.Range style={{ position: 'absolute', height: '100%', borderRadius: 999, background: '#fff' }} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label="Volume" style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', border: 0, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.45)', cursor: 'pointer' }} />
    </SliderPrimitive.Root>
  );
}
