import WorkerConstruct from 'web-worker';
import { getGlobal } from './getGlobal.js';

const global = getGlobal();

const isNode =
	typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

export const Worker: typeof globalThis.Worker = isNode ? WorkerConstruct.default : global.Worker;
