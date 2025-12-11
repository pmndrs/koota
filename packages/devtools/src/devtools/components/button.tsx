import type { ReactNode } from 'react';
import styles from './button.module.css';

interface ButtonProps {
	children: ReactNode;
	onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
	onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
	title?: string;
	active?: boolean;
	className?: string;
}

export function Button({
	children,
	onClick,
	onMouseDown,
	title,
	active = false,
	className,
}: ButtonProps) {
	return (
		<button
			className={`${styles.button} ${active ? styles.active : ''} ${className || ''}`}
			onClick={onClick}
			onMouseDown={onMouseDown}
			title={title}
		>
			{children}
		</button>
	);
}
