import * as React from 'react';

type SpinnerProps = { size?: number; label?: string };

export function Spinner({ size = 16, label = 'Carregando' }: SpinnerProps): React.ReactElement {
  return <svg role="status" aria-label={label} width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".28" strokeWidth="3" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="3"><animateTransform attributeName="transform" dur=".8s" from="0 12 12" repeatCount="indefinite" to="360 12 12" type="rotate" /></path></svg>;
}
