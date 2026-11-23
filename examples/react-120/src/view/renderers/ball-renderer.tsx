import { type Entity } from 'koota';
import { useActions, useTrait, useQuery, useWorld } from 'koota/react';
import { actions, traits } from '../../sim';

const { Ball, Dragging, Position, Ref, WobblesOnHover } = traits;

export function BallRenderer() {
  const balls = useQuery(Ball, Position);
  return balls.map((entity) => <BallView key={entity} entity={entity} />);
}

function BallView({ entity }: { entity: Entity }) {
  const world = useWorld();
  const { wobbleBall } = useActions(actions);
  const { color, radius } = useTrait(entity, Ball)!;

  const handleInit = (div: HTMLDivElement | null) => {
    if (!div) return;
    world.add(entity, Ref(div));
    return () => world.remove(entity, Ref);
  };

  const handlePointerEnter = () => {
    if (!world.has(entity, WobblesOnHover)) return;
    const wobble = world.get(entity, WobblesOnHover)!;
    wobbleBall(entity, wobble);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Calculate offset from center of ball
    const position = world.get(entity, Position)!;
    const offset = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    world.add(entity, Dragging({ offset }));
    // Engage pointer capture
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    world.remove(entity, Dragging);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handlePointerCancel = () => world.remove(entity, Dragging);
  const handleLostPointerCapture = () => world.remove(entity, Dragging);

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
