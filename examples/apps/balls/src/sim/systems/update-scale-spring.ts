import type { World } from 'koota';
import { Scale, ScaleSpring, Time } from '../traits';

export function updateScaleSpring(world: World) {
	const { delta } = world.get(Time)!;

	world.query(ScaleSpring, Scale).updateEach(([spring, scale]) => {
		// Classic damped spring toward target using normalized damping ratio
		const displacement = spring.current - spring.target;
		const stiffness = spring.stiffness;

		const cCrit = 2 * Math.sqrt(stiffness); // mass = 1
		const damping = spring.damping * cCrit;

		const accel = -stiffness * displacement - damping * spring.velocity;

		spring.velocity += accel * delta;
		spring.current += spring.velocity * delta;

		scale.value = spring.current;
	});
}
