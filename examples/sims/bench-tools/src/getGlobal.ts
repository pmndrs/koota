export const getGlobal = () => {
	if (typeof self !== 'undefined') {
		return self;
	} else if (typeof window !== 'undefined') {
		return window;
	} else if (typeof global !== 'undefined') {
		return global;
	} else {
		// Undefined context, could throw an error or handle accordingly
		throw new Error('Unknown context');
	}
};
