import * as compnonents from './index';

export const threeComponents = {} as Record<
	Uncapitalize<keyof typeof compnonents>,
	typeof compnonents.Object3D | typeof compnonents.Skeleton
>;

for (const key in compnonents) {
	threeComponents[(key[0].toLowerCase() + key.slice(1)) as Uncapitalize<keyof typeof compnonents>] =
		compnonents[key as keyof typeof compnonents];
}
