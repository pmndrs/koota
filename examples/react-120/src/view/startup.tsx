import { useActions } from 'koota/react';
import { useEffect } from 'react';
import { actions, traits } from '../sim';

const { Ball, Position, ScaleSpring, WobblesOnHover, WobblesOnIdle } = traits

const BALL_COUNT = 1_000;
const SIZE_FACTOR = 16;
const SIZE_MIN = 4;

export function Startup() {
	const { createBall, wobbleBall } = useActions(actions);

	useEffect(() => {
		const balls = Array.from({ length: BALL_COUNT }, (_, i) => {
			const ball = createBall();

			// Random position in viewport-ish coords
			const x = Math.random() * 800 + 100;
			const y = Math.random() * 500 + 100;
			ball.set(Position, { x, y });

			// Set color and radius
			const radius = SIZE_MIN + Math.random() * SIZE_FACTOR;
			const color = {
				r: Math.floor(Math.random() * 200) + 30,
				g: Math.floor(Math.random() * 200) + 30,
				b: Math.floor(Math.random() * 200) + 30,
			};
			ball.set(Ball, { radius, color });

			// Set spring qualities
			ball.set(ScaleSpring, { stiffness: 180, damping: 0.3 });

			ball.add(WobblesOnHover({ strength: 2 }));

			// Seed a small initial stagger so first idle wobbles ripple quickly
			const initialDelay = i * 300;
			setTimeout(() => {
				if (ball.isAlive()) ball.add(WobblesOnIdle({ cooldown: 4, strength: 5 }));
			}, initialDelay);

			return ball;
		});

		return () => {
			balls.forEach((ball) => ball.destroy());
		};
	}, [createBall, wobbleBall]);

	return null;
}
