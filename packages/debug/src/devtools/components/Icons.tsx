interface IconProps {
	size?: number;
	className?: string;
}

export function TraitIcon({ size = 12, className }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
			<path d="M3 2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H3zm0 7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H3zm7-7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-3zm0 7a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-3z" />
		</svg>
	);
}

export function EntityIcon({ size = 12, className }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
			<circle cx="8" cy="8" r="6" />
		</svg>
	);
}

export function GraphIcon({ size = 12, className }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
			<path d="M2 2h2v12H2V2zm4 4h2v8H6V6zm4 2h2v6h-2V8zm4-4h2v10h-2V4z" />
		</svg>
	);
}
