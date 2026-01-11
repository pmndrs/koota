import { useEffect, useRef, useState } from 'react';

interface Position {
	x: number;
	y: number;
}

export function useDraggable(defaultPosition: Position) {
	const [position, setPosition] = useState(defaultPosition);
	const [isDragging, setIsDragging] = useState(false);
	const dragOffset = useRef({ x: 0, y: 0 });

	const handleMouseDown = (e: React.MouseEvent) => {
		// Check if click is inside a button (including icon/span children)
		if ((e.target as HTMLElement).closest('button')) return;
		setIsDragging(true);
		dragOffset.current = {
			x: e.clientX - position.x,
			y: e.clientY - position.y,
		};
	};

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			setPosition({
				x: e.clientX - dragOffset.current.x,
				y: e.clientY - dragOffset.current.y,
			});
		};

		const handleMouseUp = () => setIsDragging(false);

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isDragging]);

	return { position, isDragging, handleMouseDown };
}
