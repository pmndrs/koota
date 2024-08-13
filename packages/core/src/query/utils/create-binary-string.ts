export function createBinaryString(nMask: number) {
	// nMask must be between -2147483648 and 2147483647
	for (
		var nFlag = 0, nShifted = nMask, sMask = '';
		nFlag < 32;
		nFlag++, sMask += String(nShifted >>> 31), nShifted <<= 1
	);
	return sMask;
}
