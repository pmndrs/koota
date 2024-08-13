import * as compnonents from './index';

export const domComponents = {} as Record<Uncapitalize<keyof typeof compnonents>, any>;

for (const key in compnonents) {
	domComponents[(key[0].toLowerCase() + key.slice(1)) as Uncapitalize<keyof typeof compnonents>] =
		compnonents[key as keyof typeof compnonents];
}
