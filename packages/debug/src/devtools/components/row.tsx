import type { ReactNode } from 'react';
import styles from '../styles.module.css';

interface RowProps {
	children: ReactNode;
	onClick?: () => void;
	title?: string;
}

export function Row({ children, onClick, title }: RowProps) {
	return (
		<div
			className={`${styles.row} ${onClick ? styles.rowClickable : ''}`}
			onClick={onClick}
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

