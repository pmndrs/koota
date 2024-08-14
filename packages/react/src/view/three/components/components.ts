import * as compnonents from './index';

// Union of all components
type Components = (typeof compnonents)[keyof typeof compnonents];

export const threeComponents = {} as Record<Uncapitalize<keyof typeof compnonents>, Components>;

for (const key in compnonents) {
	threeComponents[(key[0].toLowerCase() + key.slice(1)) as Uncapitalize<keyof typeof compnonents>] =
		compnonents[key as keyof typeof compnonents];
}
