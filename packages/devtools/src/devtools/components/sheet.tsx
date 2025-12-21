import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Panel } from './panel';
import styles from './sheet.module.css';

interface SheetContextValue {
	isAnimatingOut: boolean;
	handleClose: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheet() {
	const ctx = useContext(SheetContext);
	if (!ctx) {
		throw new Error('Sheet subcomponents must be used within a <Sheet>');
	}
	return ctx;
}

interface SheetProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}

function SheetBase({ open, onClose, children }: SheetProps) {
	const [isAnimatingOut, setIsAnimatingOut] = useState(false);
	const backdropRef = useRef<HTMLDivElement>(null);

	const handleClose = useCallback(() => {
		if (isAnimatingOut) return;
		setIsAnimatingOut(true);
		setTimeout(() => {
			onClose();
			setIsAnimatingOut(false);
		}, 400); // Match exit animation duration
	}, [isAnimatingOut, onClose]);

	// Handle backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === backdropRef.current) {
			handleClose();
		}
	};

	// Handle escape key
	useEffect(() => {
		if (!open) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				handleClose();
			}
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [open, handleClose]);

	if (!open && !isAnimatingOut) return null;

	return (
		<Panel.Portal>
			<SheetContext.Provider value={{ isAnimatingOut, handleClose }}>
				<div
					ref={backdropRef}
					className={`${styles.backdrop} ${isAnimatingOut ? styles.backdropExit : ''}`}
					onClick={handleBackdropClick}
				>
					<div className={`${styles.sheet} ${isAnimatingOut ? styles.sheetExit : ''}`}>
						{children}
					</div>
				</div>
			</SheetContext.Provider>
		</Panel.Portal>
	);
}

interface SheetHeaderProps {
	children: ReactNode;
	onBack?: () => void;
}

function SheetHeader({ children, onBack }: SheetHeaderProps) {
	return (
		<div className={styles.header}>
			{onBack && (
				<button className={styles.backButton} onClick={onBack}>
					←
				</button>
			)}
			<span className={styles.headerTitle}>{children}</span>
		</div>
	);
}

interface SheetSearchProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
}

function SheetSearch({ value, onChange, placeholder = 'Search...', autoFocus = false }: SheetSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (autoFocus) {
			inputRef.current?.focus();
		}
	}, [autoFocus]);

	return (
		<input
			ref={inputRef}
			type="text"
			className={styles.input}
			placeholder={placeholder}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

interface SheetListProps {
	children: ReactNode;
	emptyMessage?: string;
	isEmpty?: boolean;
}

function SheetList({ children, emptyMessage = 'No items found', isEmpty }: SheetListProps) {
	if (isEmpty) {
		return (
			<div className={styles.list}>
				<div className={styles.empty}>{emptyMessage}</div>
			</div>
		);
	}

	return <div className={styles.list}>{children}</div>;
}

interface SheetItemProps {
	children: ReactNode;
	onClick?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	disabled?: boolean;
	className?: string;
}

function SheetItem({ children, onClick, onMouseEnter, onMouseLeave, disabled, className }: SheetItemProps) {
	return (
		<button
			className={`${styles.item} ${disabled ? styles.itemDisabled : ''} ${className || ''}`}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			disabled={disabled}
		>
			{children}
		</button>
	);
}

export const Sheet = Object.assign(SheetBase, {
	Header: SheetHeader,
	Search: SheetSearch,
	List: SheetList,
	Item: SheetItem,
});

export { useSheet };

