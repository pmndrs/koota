import { getEntityId, type Entity } from 'koota';
import { useHas, useQueryFirst, useTrait, useWorld } from 'koota/react';
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
  // Read the hand in relation order. Membership and order changes publish a new array.
  const cards = useTrait(hand, OrderedCards);

  if (!cards) return null;

  return (
    <div className="hand-container">
      {/* Map each card to a view */}
      {cards.map((card) => (
        <CardView key={getEntityId(card)} entity={card} />
      ))}
    </div>
  );
}

function CardView({ entity }: { entity: Entity }) {
  const world = useWorld();
  const card = useTrait(entity, Card);
  const isDragging = useHas(entity, Dragging);

  // When the element is created, attach it to the entity with the Ref trait.
  // This is used to sync the position and rotation of the card to the DOM.
  const handleInit = useCallback(
    (div: HTMLDivElement | null) => {
      if (!div) return;
      world.add(entity, Ref(div));
      return () => world.remove(entity, Ref);
    },
    [world, entity]
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

      world.set(entity, Position, { x: centerX, y: centerY });
      world.set(entity, Velocity, { x: 0, y: 0 });
      world.add(entity, Dragging({ offset }));

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [world, entity]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      world.remove(entity, Dragging);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [world, entity]
  );

  const handlePointerCancel = useCallback(() => {
    world.remove(entity, Dragging);
  }, [world, entity]);

  /**
   * We only remove dragging when the mouse buttons are released.
   * When React reorders, the captured element can be unmounted/remounted, and the browser fires
   * a lostpointercapture event because the element holding capture disappears.
   */
  const handleLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.buttons === 0) world.remove(entity, Dragging);
    },
    [world, entity]
  );

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
