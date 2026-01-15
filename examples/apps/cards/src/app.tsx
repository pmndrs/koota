import type { Entity } from 'koota';
import { useHas, useQuery, useQueryFirst, useTrait } from 'koota/react';
import { useCallback } from 'react';
import { Frameloop } from './frameloop';
import { Startup } from './startup';
import { Card, Dragging, Hand, OrderedCards, Position, Ref, Velocity } from './traits';

export function App() {
    return (
        <>
            <HandRenderer />
            <Frameloop />
            <Startup />
        </>
    );
}

/**
 * Renders the hand of cards.
 */
function HandRenderer() {
    // We only want to render a single hand, so we query the first
    const hand = useQueryFirst(Hand, OrderedCards);
    // Get the ordered cards, with is a special ordered list view of the HeldBy relation
    const cards = useTrait(hand, OrderedCards);

    if (!cards) return null;

    return (
        <div className="hand-container">
            {/* Map each card to a view */}
            {cards.map((card) => (
                <CardView key={card.id()} entity={card} />
            ))}
        </div>
    );
}

function CardView({ entity }: { entity: Entity }) {
    const card = useTrait(entity, Card);
    const isDragging = useHas(entity, Dragging);

    // When the element is created, attach it to the entity with the Ref trait.
    // This is used to sync the position and rotation of the card to the DOM.
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
