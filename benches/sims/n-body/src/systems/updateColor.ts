import { Not } from 'koota';
import { Repulse, Color, Velocity } from '../components';
import { colorFromSpeed } from '../utils/colorFromSpeed';

export const updateColor = ({ world }: { world: Koota.World }) => {
	const results = world.query(Velocity, Color, Not(Repulse));

	results.updateEach(([velocity, color]) => {
		const speed = Math.hypot(velocity.x, velocity.y);
		const { r, g, b, a } = colorFromSpeed(speed);

		color.r = r;
		color.g = g;
		color.b = b;
		color.a = a;
	});
};
