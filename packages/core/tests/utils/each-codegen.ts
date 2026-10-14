const NativeFunction = globalThis.Function;

/** Runs `body` as if the environment blocked code generation for each loops, counting blocked builds. */
export function withoutEachCodegen<T>(body: () => T): [T, number] {
  let blocked = 0;
  function Blocking(...args: string[]) {
    if (String(args.at(-1)).includes('koota-each')) {
      blocked++;
      throw new EvalError('Code generation is blocked');
    }
    return NativeFunction(...args);
  }
  Blocking.prototype = NativeFunction.prototype;
  globalThis.Function = Blocking as unknown as FunctionConstructor;
  try {
    return [body(), blocked];
  } finally {
    globalThis.Function = NativeFunction;
  }
}
