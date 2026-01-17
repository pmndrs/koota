import { trait } from 'koota';

export const Time = trait({ delta: 0, current: 0 });
export const Timer = trait({ duration: 0, remaining: 0, completed: false });

export const Position = trait({ x: 0, y: 0 });
export const Scale = trait({ value: 1 });
export const Velocity = trait({ x: 0, y: 0 });

export const Ball = trait({
	radius: 10,
	color: () => ({ r: 0, g: 0, b: 0 }),
});

// Spring-based scale wobble
export const ScaleSpring = trait({
	current: 1,
	target: 1,
	velocity: 0,
	stiffness: 200,
	damping: 0.7,
});

export const IsIdle = trait();
export const WobblesOnIdle = trait({ cooldown: 4, strength: 0.25 });
export const WobblesOnHover = trait({ strength: 0.5 });

export const Ref = trait(() => null! as HTMLDivElement);

// Input
export const Dragging = trait({ offset: () => ({ x: 0, y: 0 }) });
export const Pointer = trait({ x: 0, y: 0 });

export const Wall = trait({ width: 0, height: 0 });
