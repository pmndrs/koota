import { $internal } from '../symbols';
import { World } from '../world';

// These should be Float32Arrays since we are using bitwise operations.
// They are native Arrays to avoid overlow issues due to recycling.
export const incrementWorldBitflag = (world: World) => {
	const ctx = world[$internal];

	ctx.bitflag *= 2;

	if (ctx.bitflag >= 2 ** 31) {
		ctx.bitflag = 1;
		ctx.entityMasks.push(new Array());
	}
};
