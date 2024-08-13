import { $bitflag, $entityMasks } from '../symbols';
import { World } from '../world';

// These should be Float32Arrays since we are using bitwise operations.
// They are native Arrays to avoid overlow issues due to recycling.
export const incrementWorldBitflag = (world: World) => {
	world[$bitflag] *= 2;

	if (world[$bitflag] >= 2 ** 31) {
		world[$bitflag] = 1;
		world[$entityMasks].push(new Array());
	}
};
