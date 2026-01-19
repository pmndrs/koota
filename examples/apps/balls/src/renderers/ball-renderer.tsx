import { $internal, createQuery, type Entity, type QueryParameter, type QueryResult } from 'koota';
import { useActions, useTrait, useWorld, useQuery } from 'koota/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, traits } from '../sim';

const { Ball, Dragging, Position, Ref, WobblesOnHover } = traits

export function BallRenderer() {
	const balls = useQuery(Ball, Position);
	return balls.map((entity) => <BallView key={entity} entity={entity} />);
}

function BallView({ entity }: { entity: Entity }) {
	const { wobbleBall } = useActions(actions);
	const { color, radius } = useTrait(entity, Ball)!;

	const handleInit = (div: HTMLDivElement | null) => {
		if (!div) return;
		entity.add(Ref(div));
		return () => entity.remove(Ref);
	};

	const handlePointerEnter = () => {
		if (!entity.has(WobblesOnHover)) return;
		const wobble = entity.get(WobblesOnHover)!;
		wobbleBall(entity, wobble);
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		// Calculate offset from center of ball
		const position = entity.get(Position)!;
		const offset = {
			x: event.clientX - position.x,
			y: event.clientY - position.y,
		};
		entity.add(Dragging({ offset }));
		// Engage pointer capture
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		entity.remove(Dragging);
		event.currentTarget.releasePointerCapture(event.pointerId);
	};

	const handlePointerCancel = () => entity.remove(Dragging);
	const handleLostPointerCapture = () => entity.remove(Dragging);

	const size = radius * 2;

	return (
		<div
			ref={handleInit}
			onPointerEnter={handlePointerEnter}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			onLostPointerCapture={handleLostPointerCapture}
			className="ball"
			style={{
				width: size,
				height: size,
				backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`,
			}}
		/>
	);
}