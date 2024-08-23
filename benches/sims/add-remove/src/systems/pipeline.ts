import { setInitial } from './setInitial';
import { updateGravity } from './updateGravity';
import { moveBodies } from './moveBodies';
import { updateTime } from './updateTime';
import { recycleBodies } from './recycleBodies';

export const pipeline = ({ world }: { world: Koota.World }) => {
	updateTime({ world });
	setInitial({ world });
	updateGravity({ world });
	moveBodies({ world });
	recycleBodies({ world });
};
