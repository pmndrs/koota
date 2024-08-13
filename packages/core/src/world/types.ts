import { World } from './world';

export type System = (world: World) => void;
