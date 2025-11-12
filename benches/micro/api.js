import { bench, do_not_optimize, run as mitataRun } from 'mitata';
import traceLogger from './utils/traceLogger.js';
import logDelimiters from './utils/constants/logDelimiters.js';

export function microbench(title) {
    let setupFn = () => {};
    let _args = {};
    const runner = {
        args(nameOrObj, values) {
            if (typeof nameOrObj === 'object' && nameOrObj !== null) {
                Object.assign(_args, nameOrObj);
            } else {
                _args[nameOrObj] = values;
            }
            return this;
        },
        setup(callback) {
            setupFn = callback;
            return this;
        },
        measure(toBench) {
            const generatorFn = function* (ctx) {
                const currentArgs = {};
                for (const name in _args) {
                    currentArgs[name] = ctx.get(name);
                }
                traceLogger.setRunKey(title, currentArgs);
                const setupResult = setupFn(currentArgs);
                traceLogger.recordSetup(setupResult);
                let i = 0;
                yield {
                    [0]() {
                        return Array.isArray(setupResult) ? [...setupResult] : {...setupResult};
                    },
                    bench(setupResult) {
                        const result = toBench(setupResult, i);
                        traceLogger.recordFirstBench(setupResult, toBench, result);
                        i++;
                        return do_not_optimize(result);
                    },
                };
                traceLogger.recordPostBench(setupResult, toBench, i);
            };
            const b = bench(title, generatorFn).gc("inner");
            if (Object.keys(_args).length > 0) {
                b.args(_args);
            }
            return b;
        }
    };

    return runner;
}

export async function run(options = { format: 'markdown' }) {
    console.log(`${logDelimiters.microbench.start}`);
    await mitataRun(options);
    console.log(`${logDelimiters.microbench.end}`);
}