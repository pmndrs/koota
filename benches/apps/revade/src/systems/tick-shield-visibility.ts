import { World } from 'koota';
import { ShieldVisibility, Time, IsShieldVisible } from '../traits';

export const tickShieldVisibility = ({ world }: { world: World }) => {
	const { delta } = world.get(Time);
	world.query(ShieldVisibility).updateEach(([shield], entity) => {
		shield.current += delta * 1000;

		if (shield.current >= shield.duration) {
			entity.remove(ShieldVisibility, IsShieldVisible);
		} else {
			// // Calculate remaining time percentage
			// const remainingPercent = 1 - shield.current / shield.duration;
			// // Increase blink frequency as time runs out
			// const blinkFrequency = 250 + remainingPercent * 400;

			const blinkFrequency = 250;
			// Use sine wave for smooth blinking, faster at end
			const shouldBeVisible = Math.sin((shield.current / blinkFrequency) * Math.PI * 2) > 0;

			if (shouldBeVisible) {
				entity.add(IsShieldVisible);
			} else {
				entity.remove(IsShieldVisible);
			}
		}
	});
};
