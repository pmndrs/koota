import { Schema, Store } from '../types';

export function createStore<T extends Schema>(schema: T): Store<T> {
	if (typeof schema === 'function') {
		return [] as any;
	} else {
		const store = {} as any;

		for (const key in schema) {
			store[key] = [];

			// Legacy code for TypedArray support -- MT in particular.
			// I will revist this later.

			// if (isTypedArray(normalizedSchema[key])) {
			// 	// Create a SharedArrayBuffer if supported, otherwise create an ArrayBuffer.
			// 	const constructor =
			// 		TypedArrayMap[normalizedSchema[key].type as keyof typeof TypedArrayMap];
			// 	const byteLength = universe.getSize() * constructor.BYTES_PER_ELEMENT;
			// 	const buffer = isSabSupported()
			// 		? new SharedArrayBuffer(byteLength)
			// 		: new ArrayBuffer(byteLength);
			// 	store[key] = new constructor(buffer);
			// 	// Resize the store if the world size changes
			// 	universe.onResize((world, size) => {
			// 		const newBuffer = isSabSupported()
			// 			? new SharedArrayBuffer(size * constructor.BYTES_PER_ELEMENT)
			// 			: new ArrayBuffer(size * constructor.BYTES_PER_ELEMENT);
			// 		const newStore = new constructor(newBuffer);
			// 		newStore.set(store[key]);
			// 		store[key] = newStore;
			// 	});
			// } else {
			// 	store[key] = [];
			// }
		}

		return store;
	}
}
