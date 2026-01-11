import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCustomScrollbar } from '../hooks/use-custom-scrollbar';
import { useDraggable } from '../hooks/use-draggable';
import styles from './panel.module.css';

interface PanelProps {
	children: ReactNode;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	defaultZoom?: number;
}

interface PanelContextValue {
	isOpen: boolean;
	setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
	isDragging: boolean;
	handleHeaderMouseDown: (e: React.MouseEvent) => void;
	zoom: number;
	setZoom: React.Dispatch<React.SetStateAction<number>>;
	portalRoot: HTMLDivElement | null;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel() {
	const ctx = useContext(PanelContext);
	if (!ctx) {
		throw new Error('usePanel must be used within a <Panel>');
	}
	return ctx;
}

function PanelBase({
	children,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
	defaultZoom = 1,
}: PanelProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const [zoom, setZoom] = useState(defaultZoom);
	const { position, isDragging, handleMouseDown } = useDraggable(defaultPosition);
	const portalRootRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const handleZoomIn = useCallback(() => {
		setZoom((prev) => Math.min(prev + 0.1, 2));
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoom((prev) => Math.max(prev - 0.1, 0.5));
	}, []);

	const handleZoomReset = useCallback(() => {
		setZoom(1);
	}, []);

	// Keyboard shortcuts for zoom (Cmd/Ctrl + +/-/0)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd/Ctrl + Plus or Equals
			if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) {
				e.preventDefault();
				handleZoomIn();
			}
			// Cmd/Ctrl + Minus
			if ((e.metaKey || e.ctrlKey) && e.key === '-') {
				e.preventDefault();
				handleZoomOut();
			}
			// Cmd/Ctrl + 0 (reset)
			if ((e.metaKey || e.ctrlKey) && e.key === '0') {
				e.preventDefault();
				handleZoomReset();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleZoomIn, handleZoomOut, handleZoomReset]);

	const contextValue: PanelContextValue = {
		isOpen,
		setIsOpen,
		isDragging,
		handleHeaderMouseDown: handleMouseDown,
		zoom,
		setZoom,
		portalRoot: portalRootRef.current,
		scrollRef,
	};

	return (
		<PanelContext.Provider value={contextValue}>
			<div
				className={styles.root}
				style={{
					top: position.y,
					left: position.x,
					transform: `scale(${zoom})`,
					transformOrigin: 'top left',
				}}
				data-koota-devtools-root
			>
				<div ref={portalRootRef} className={styles.panel}>
					{children}
				</div>
			</div>
		</PanelContext.Provider>
	);
}

interface PanelHeaderProps {
	children: ReactNode;
	className?: string;
}

function PanelHeader({ children, className }: PanelHeaderProps) {
	const { isDragging, handleHeaderMouseDown } = usePanel();

	return (
		<div
			className={`${className || ''} ${styles.header}`}
			style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
			onMouseDown={handleHeaderMouseDown}
		>
			{children}
		</div>
	);
}

interface PanelContentProps {
	children: ReactNode;
}

function PanelContent({ children }: PanelContentProps) {
	const { isOpen, scrollRef } = usePanel();
	if (!isOpen) return null;

	const { contentRef, isScrollable, isScrollbarVisible, rootProps, thumbStyle, thumbProps } =
		useCustomScrollbar(scrollRef);

	return (
		<div className={styles.scrollRoot} {...rootProps}>
			<div ref={scrollRef} className={styles.scroll} data-koota-devtools-scroll>
				<div ref={contentRef} className={styles.scrollContent}>
					{children}
				</div>
			</div>
			{isScrollable ? (
				<div
					className={`${styles.scrollbar} ${
						isScrollbarVisible ? styles.scrollbarVisible : ''
					}`}
					aria-hidden="true"
				>
					<div
						className={styles.scrollThumb}
						style={thumbStyle}
						{...thumbProps}
						aria-hidden="true"
					/>
				</div>
			) : null}
		</div>
	);
}

interface PanelPortalProps {
	children: ReactNode;
}

function PanelPortal({ children }: PanelPortalProps) {
	const { portalRoot } = usePanel();

	if (!portalRoot) return null;

	return createPortal(children, portalRoot);
}

export const Panel = Object.assign(PanelBase, {
	Header: PanelHeader,
	Content: PanelContent,
	Portal: PanelPortal,
});
