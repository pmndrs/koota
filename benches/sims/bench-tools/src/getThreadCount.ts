import { getGlobal } from './getGlobal.js';

const global = getGlobal();

const isNode =
	typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
const os = isNode ? await import('os') : undefined;

const threadCount = isNode && os ? os.cpus().length : global.navigator.hardwareConcurrency;

export const getThreadCount = () => threadCount;
