import styles from './icons.module.css';

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 12, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      {children}
    </svg>
  );
}

export function TraitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H3zm0 7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H3zm7-7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-3zm0 7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-3z" />
    </Svg>
  );
}

export function EntityIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M8 2l5.196 3v6L8 14l-5.196-3V5L8 2zm0 2.5l-3.464 2v4l3.464 2 3.464-2v-4l-3.464-2z"
      />
    </Svg>
  );
}

export function WorldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path
        d="M8 2.5 Q10.5 8 8 13.5 M8 2.5 Q5.5 8 8 13.5 M2.5 8 h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </Svg>
  );
}

export function GraphIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 2h2v12H2V2zm4 4h2v8H6V6zm4 2h2v6h-2V8zm4-4h2v10h-2V4z" />
    </Svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
    </Svg>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z" />
    </Svg>
  );
}

/** A disclosure arrow for expandable rows and sections. */
export function Chevron({ open }: { open: boolean }) {
  return <span className={styles.chevron}>{open ? '▼' : '▶'}</span>;
}
