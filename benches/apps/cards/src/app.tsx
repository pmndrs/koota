import type { Entity } from 'koota';
import { useHas, useQuery, useTrait } from 'koota/react';
import { useCallback } from 'react';
import { Frameloop } from './frameloop';
import { Startup } from './startup';
import { Card, Dragging, IsHand, OrderedCards, Position, Ref, Velocity } from './traits';

export function App() {
	return (
		<>
			<HandView />
			<Frameloop />
			<Startup />
		</>
	);
}

function HandView() {
	const hands = useQuery(IsHand, OrderedCards);
	const hand = hands[0] ?? null;
	const cards = useTrait(hand, OrderedCards);

	if (!hand || !cards) return null;

	return (
		<div className="hand-container">
			{[...cards].map((card) => (
				<CardView key={card.id()} entity={card} />
			))}
		</div>
	);
}

interface CardViewProps {
	entity: Entity;
}

function CardView({ entity }: CardViewProps) {
	const card = useTrait(entity, Card);
	const isDragging = useHas(entity, Dragging);

	const handleInit = useCallback(
		(div: HTMLDivElement | null) => {
			if (!div) return;
			entity.add(Ref(div));
			return () => entity.remove(Ref);
		},
		[entity]
	);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const rect = event.currentTarget.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;

			const offset = {
				x: event.clientX - centerX,
				y: event.clientY - centerY,
			};

			entity.set(Position, { x: centerX, y: centerY });
			entity.set(Velocity, { x: 0, y: 0 });
			entity.add(Dragging({ offset }));

			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[entity]
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			entity.remove(Dragging);
			event.currentTarget.releasePointerCapture(event.pointerId);
		},
		[entity]
	);

	const handlePointerCancel = useCallback(() => {
		entity.remove(Dragging);
	}, [entity]);

	const handleLostPointerCapture = useCallback(() => {
		entity.remove(Dragging);
	}, [entity]);

	if (!card) return null;

	return (
		<div
			ref={handleInit}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			onLostPointerCapture={handleLostPointerCapture}
			className={`card ${isDragging ? 'dragging' : ''}`}
		>
			<div className="card-cost">{card.cost}</div>
			<div className="card-name">{card.name}</div>
			<div className="card-description">{card.description}</div>
		</div>
	);
}
