import type { ReactNode } from 'react';
import styles from './row.module.css';

interface RowProps {
	children: ReactNode;
	onClick?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	title?: string;
	noHover?: boolean;
}

export function Row({ children, onClick, onMouseEnter, onMouseLeave, title, noHover }: RowProps) {
	return (
		<div
			className={`${styles.row} ${onClick ? styles.rowClickable : ''} ${
				noHover ? styles.rowNoHover : ''
			}`}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			title={title}
		>
			{children}
		</div>
	);
}

export function RowName({ children }: { children: ReactNode }) {
	return <span className={styles.rowName}>{children}</span>;
}

export function RowMeta({ children }: { children: ReactNode }) {
	return <span className={styles.rowMeta}>{children}</span>;
}

export function RowCount({ children }: { children: ReactNode }) {
	return <span className={styles.rowCount}>{children}</span>;
}
