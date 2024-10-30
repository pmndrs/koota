import { World } from 'koota';
import { Input, IsPlayer } from '../traits';

// Track key states.

const keys = {
	arrowUp: false,
	arrowDown: false,
	arrowLeft: false,
	arrowRight: false,
};

window.addEventListener('keydown', (e) => {
	switch (e.key.toLowerCase()) {
		case 'arrowup':
			keys.arrowUp = true;
			break;
		case 'arrowdown':
			keys.arrowDown = true;
			break;
		case 'arrowleft':
			keys.arrowLeft = true;
			break;
		case 'arrowright':
			keys.arrowRight = true;
			break;
	}
});

window.addEventListener('keyup', (e) => {
	switch (e.key.toLowerCase()) {
		case 'arrowup':
			keys.arrowUp = false;
			break;
		case 'arrowdown':
			keys.arrowDown = false;
			break;
		case 'arrowleft':
			keys.arrowLeft = false;
			break;
		case 'arrowright':
			keys.arrowRight = false;
			break;
	}
});

export const pollInput = ({ world }: { world: World }) => {
	world.query(IsPlayer, Input).updateEach(([direction]) => {
		// Get horizontal and vertical input.
		const horizontal = (keys.arrowRight ? 1 : 0) - (keys.arrowLeft ? 1 : 0);
		const vertical = (keys.arrowUp ? 1 : 0) - (keys.arrowDown ? 1 : 0);

		// Normalize the vector if moving diagonally.
		const length = Math.sqrt(horizontal * horizontal + vertical * vertical);
		if (length > 0) {
			direction.x = horizontal / (length || 1);
			direction.y = vertical / (length || 1);
		} else {
			direction.x = 0;
			direction.y = 0;
		}
	});
};
