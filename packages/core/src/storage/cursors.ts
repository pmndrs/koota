/** write diffs and flags changes for tracked walks, plain stores bare, read drops writes. */
export type CursorKind = 'write' | 'plain' | 'read';

/**
 * A cursor stands in for a SoA record during a walk. Scalar fields read and write the bound page
 * at the current offset, so nothing is copied per entity. A tuple field is an array the cursor
 * owns, filled when the cursor moves and stored back after the callback.
 */
export type CursorSet = Record<CursorKind, object>;

/**
 * Every trait has cursor classes of its own, compiled the first time it is walked. The compiler
 * supplies a prefix outside the schema's field names.
 */
export function createCursorFactory(
  keys: string[],
  strides: number[],
  prefix: string
): () => CursorSet {
  let Cursors: (new () => CursorSet) | undefined;
  return () => new (Cursors ??= compileCursorSetClass(keys, strides, prefix))();
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
    ${cursorClassSource('Write', keys, strides, prefix, 'write')}
    ${cursorClassSource('Plain', keys, strides, prefix, 'plain')}
    ${cursorClassSource('Read', keys, strides, prefix, 'read')}
    function Cursors() { this.write = new Write(); this.plain = new Plain(); this.read = new Read(); }
    return Cursors;`
  )();
}

function cursorClassSource(
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
