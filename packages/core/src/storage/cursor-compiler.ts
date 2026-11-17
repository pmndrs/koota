import { createCursorFactory, type CursorKind, type CursorSet } from './cursors';
import { getStride } from './schema';
import type { Schema } from './types';

/**
 * Source for one cursor in one generated walk. Initialize once, bind before seek, seek before flush.
 * The fragments share locals derived from the cursor name, which must be unique in the walk.
 */
export type CursorSource = {
  /** Statements that capture cursor-owned data once per walk. */
  init: string;
  bind: string;
  seek: Record<CursorKind, string>;
  /** Empty for reads and for schemas whose fields are all written in place. */
  flush: Record<CursorKind, string>;
  /** Expression for whether a write cursor changed anything since seek. */
  changed: string;
};

/** Creates runtime cursors and compiles the storage code that drives them during a walk. */
export type CursorCompiler = {
  create(): CursorSet;
  compile(cursor: string, store: string, page: string, offset: string): CursorSource;
};

export function createCursorCompiler(schema: Schema): CursorCompiler {
  const keys = Object.keys(schema);
  const strides = keys.map((key) => getStride(schema, key));
  // No schema field can shadow an internal slot, including fields that begin with dollars.
  let prefix = '$';
  while (keys.some((key) => key.startsWith(prefix))) prefix += '$';

  return {
    create: createCursorFactory(keys, strides, prefix),
    compile(cursor, store, page, offset) {
      const init: string[] = [];
      const bind: string[] = [];
      const seek: string[] = [];
      const plain: string[] = [];
      const write: string[] = [];
      const changed = `${cursor}.${prefix}changed`;
      if (strides.some((stride) => stride === 0)) seek.push(`${cursor}.${prefix}o = ${offset};`);

      keys.forEach((key, k) => {
        const column = `${store}[${JSON.stringify(key)}][${page}]`;
        const stride = strides[k];
        if (stride === 0) {
          bind.push(`${cursor}.${prefix}${k} = ${column};`);
          return;
        }
        // Tuple copies keep their identity throughout the walk, including tuple assignments.
        init.push(`var ${cursor}t${k} = ${cursor}.${prefix}t${k};`);
        bind.push(`var ${cursor}p${k} = ${column};`);
        seek.push(`var ${cursor}b${k} = ${offset} * ${stride};`);
        for (let c = 0; c < stride; c++) {
          const stored = `${cursor}p${k}[${cursor}b${k}${c ? ` + ${c}` : ''}]`;
          const copy = `${cursor}t${k}[${c}]`;
          seek.push(`${copy} = ${stored};`);
          plain.push(`${stored} = ${copy};`);
          write.push(`if (${stored} !== ${copy}) { ${stored} = ${copy}; ${changed} = true; }`);
        }
      });

      const move = seek.join(' ');
      return {
        init: init.join(' '),
        bind: bind.join(' '),
        seek: { read: move, plain: move, write: `${changed} = false; ${move}` },
        flush: { read: '', plain: plain.join(' '), write: write.join(' ') },
        changed,
      };
    },
  };
}
