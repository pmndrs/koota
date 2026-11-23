import { useActions, useWorld } from 'koota/react';
import { useEffect } from 'react';
import { actions, traits } from '../sim';

const { Ball, Position, ScaleSpring, WobblesOnHover, WobblesOnIdle } = traits;

const BALL_COUNT = 1_000;
const SIZE_FACTOR = 16;
const SIZE_MIN = 4;

export function Startup() {
  const world = useWorld();
  const { createBall, wobbleBall } = useActions(actions);

  useEffect(() => {
    const balls = Array.from({ length: BALL_COUNT }, (_, i) => {
      const ball = createBall();

      // Random position in viewport-ish coords
      const x = Math.random() * 800 + 100;
      const y = Math.random() * 500 + 100;
      world.set(ball, Position, { x, y });

      // Set color and radius
      const radius = SIZE_MIN + Math.random() * SIZE_FACTOR;
      const color = {
        r: Math.floor(Math.random() * 200) + 30,
        g: Math.floor(Math.random() * 200) + 30,
        b: Math.floor(Math.random() * 200) + 30,
      };
      world.set(ball, Ball, { radius, color });

      // Set spring qualities
      world.set(ball, ScaleSpring, { stiffness: 180, damping: 0.3 });

      world.add(ball, WobblesOnHover({ strength: 2 }));

      // Seed a small initial stagger so first idle wobbles ripple quickly
      const initialDelay = i * 300;
      setTimeout(() => {
        if (world.isAlive(ball)) world.add(ball, WobblesOnIdle({ cooldown: 4, strength: 5 }));
      }, initialDelay);

      return ball;
    });

    return () => {
      balls.forEach((ball) => world.destroy(ball));
    };
  }, [world, createBall, wobbleBall]);

  return null;
}
