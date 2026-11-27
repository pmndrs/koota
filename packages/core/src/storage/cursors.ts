import { getStride } from './schema';
import type { CursorCompiler, CursorKind, CursorSet, Schema } from './types';

export function createCursorCompiler(schema: Schema): CursorCompiler {
  const keys = Object.keys(schema);
  const strides = keys.map((key) => getStride(schema, key));
  // No schema field can shadow an internal slot, including fields that begin with dollars.
  let prefix = '$';
  while (keys.some((key) => key.startsWith(prefix))) prefix += '$';

  let Cursors: (new () => CursorSet) | undefined;
  return {
    create() {
      Cursors ??= compileCursorSetClass(keys, strides, prefix);
      return new Cursors();
    },
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

/**
 * The set is a class of its own, so each of its fields only ever holds one cursor class. V8 then
 * knows a cursor's shape from the field it was read from, and a walk runs without checking it.
 * An object literal would share its hidden class with every literal of the same keys.
 */
function compileCursorSetClass(
  keys: string[],
  strides: number[],
  prefix: string
): new () => CursorSet {
  return new Function(
    `'use strict';
    ${createCursorClassSource('Write', keys, strides, prefix, 'write')}
    ${createCursorClassSource('Plain', keys, strides, prefix, 'plain')}
    ${createCursorClassSource('Read', keys, strides, prefix, 'read')}
    function Cursors() { this.write = new Write(); this.plain = new Plain(); this.read = new Read(); }
    return Cursors;`
  )();
}

function createCursorClassSource(
  Cursor: string,
  keys: string[],
  strides: number[],
  prefix: string,
  kind: CursorKind
) {
  const hidden = (slot: string, value: string) =>
    `Object.defineProperty(this, '${slot}', { value: ${value}, writable: true, enumerable: false, configurable: false });`;

  // Schema fields are enumerable own properties. Every cursor of this kind shares their accessors.
  const slots = [hidden(`${prefix}o`, '0'), hidden(`${prefix}changed`, 'false')];
  const accessors = keys.map((key, k) => {
    let get = `return this.${prefix}${k}[this.${prefix}o];`;
    let set =
      kind === 'write'
        ? `var p = this.${prefix}${k}; if (p[this.${prefix}o] !== v) { p[this.${prefix}o] = v; this.${prefix}changed = true; }`
        : `this.${prefix}${k}[this.${prefix}o] = v;`;
    if (strides[k] === 0) {
      slots.push(hidden(`${prefix}${k}`, 'null'));
    } else {
      // Assigning a tuple copies its elements, so the cursor never holds a caller's array.
      slots.push(hidden(`${prefix}t${k}`, `[${'0,'.repeat(strides[k])}]`));
      get = `return this.${prefix}t${k};`;
      set = `var t = this.${prefix}t${k}; ${Array.from({ length: strides[k] }, (_, c) => `t[${c}] = v[${c}];`).join(' ')}`;
    }
    return `[${JSON.stringify(key)}]: {
      get: function () { ${get} },
      set: function (v) { ${kind === 'read' ? '' : set} },
      enumerable: true,
    }`;
  });

  return `var ${Cursor}Fields = { ${accessors.join(', ')} };
    function ${Cursor}() {
      ${slots.join(' ')}
      Object.defineProperties(this, ${Cursor}Fields);
    }`;
}
