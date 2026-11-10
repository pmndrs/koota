import type { Rolldown } from 'tsdown';

type Node = { type: string; start: number; end: number } & Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

function visit(node: Node, enter: (node: Node) => void) {
  enter(node);
  for (const key in node) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child, enter);
    } else if (isNode(value)) visit(value, enter);
  }
}

/** Names an assignment target writes, through any destructuring pattern. */
function writtenNames(target: Node | null, names: Set<string>) {
  if (!target) return;
  if (target.type === 'Identifier') names.add(target.name as string);
  else if (target.type === 'ArrayPattern') {
    for (const element of target.elements as (Node | null)[]) writtenNames(element, names);
  } else if (target.type === 'ObjectPattern') {
    for (const property of target.properties as Node[]) {
      writtenNames(
        (property.type === 'RestElement' ? property.argument : property.value) as Node,
        names
      );
    }
  } else if (target.type === 'AssignmentPattern') writtenNames(target.left as Node, names);
  else if (target.type === 'RestElement') writtenNames(target.argument as Node, names);
}

/**
 * V8 keeps a binding that a chunk exports in a module cell and reads the cell on every
 * use. An unexported constant folds into optimized code instead. Exporting an alias
 * leaves the chunk's own reads on a binding that folds, and importers get the same value.
 */
export function decoupleExports(): Rolldown.Plugin {
  return {
    name: 'koota:decouple-exports',
    renderChunk(code, chunk, options, meta) {
      if (options.format !== 'es' || !chunk.fileName.endsWith('.js')) return null;
      // An import cycle can read an export before this chunk has run to the alias.
      if (chunk.imports.some((fileName) => fileName in meta.chunks)) return null;

      const program = this.parse(code) as unknown as Node;
      const body = program.body as Node[];

      // An alias copies the value once, so only bindings that never change qualify.
      const fixed = new Set<string>();
      for (const statement of body) {
        if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
          for (const declarator of statement.declarations as Node[]) {
            const id = declarator.id as Node;
            if (id.type === 'Identifier') fixed.add(id.name as string);
          }
        } else if (
          statement.type === 'FunctionDeclaration' ||
          statement.type === 'ClassDeclaration'
        ) {
          fixed.add((statement.id as Node).name as string);
        }
      }
      // A function or class can be assigned again. A same named local also lands here,
      // which only leaves that export as it was.
      const written = new Set<string>();
      visit(program, (node) => {
        if (node.type === 'AssignmentExpression') writtenNames(node.left as Node, written);
        else if (node.type === 'UpdateExpression') writtenNames(node.argument as Node, written);
        else if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
          const left = node.left as Node;
          if (left.type !== 'VariableDeclaration') writtenNames(left, written);
        }
      });

      let output = code;
      for (const statement of body.toReversed()) {
        if (statement.type !== 'ExportNamedDeclaration') continue;
        if (statement.source || statement.declaration) continue;
        const aliases: string[] = [];
        const specifiers = (statement.specifiers as Node[]).map((specifier) => {
          const text = code.slice(specifier.start, specifier.end);
          const local = specifier.local as Node;
          const exported = specifier.exported as Node;
          const name = local.name as string | undefined;
          if (name === undefined || !fixed.has(name) || written.has(name)) return text;
          let alias = `${name}$export`;
          while (code.includes(alias)) alias += '$';
          aliases.push(`const ${alias} = ${name};`);
          return `${alias} as ${code.slice(exported.start, exported.end)}`;
        });
        if (aliases.length === 0) continue;
        output =
          output.slice(0, statement.start) +
          `${aliases.join('\n')}\nexport { ${specifiers.join(', ')} };` +
          output.slice(statement.end);
      }
      return output === code ? null : { code: output, map: null };
    },
  };
}
