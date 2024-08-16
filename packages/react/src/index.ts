export { World } from './world/world';
export { useWorld } from './world/use-world';
export { WorldContext } from './world/world-context';
export { Entity } from './entity/entity';
export { useEntity } from './entity/use-entity';
export { useComponent } from './component/use-component';
export { type ComponentProp } from './component/types';
export { useQuery } from './query/use-query';

// Views
import { koota as kootaThree } from './view/three/index';
import { koota as kootaDom } from './view/dom/index';

export const koota = { ...kootaThree, ...kootaDom };
export const k = koota;

export * from './view/three/components/index';
export * from './view/dom/components/index';
