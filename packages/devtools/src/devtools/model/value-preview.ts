export type ValueKind =
  'null' | 'undefined' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'function' | 'other';

export function getValueKind(value: unknown): ValueKind {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';

  const type = typeof value;
  switch (type) {
    case 'object':
    case 'string':
    case 'number':
    case 'boolean':
    case 'function':
      return type;
    default:
      return 'other';
  }
}

export function getChildEntries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (typeof value === 'object' && value !== null) return Object.entries(value);
  return [];
}

export function getConstructorName(value: object): string {
  const name = value.constructor?.name;
  return name && name !== 'Object' ? name : 'Object';
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function previewScalar(value: unknown, max: number): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${truncate(value, max)}"`;
  if (typeof value === 'object') return Array.isArray(value) ? '[…]' : '{…}';
  return truncate(String(value), max);
}

/**
 * A one line summary of the first couple of children, shown while a value is
 * collapsed so the shape is visible without expanding it.
 */
export function previewChildren(value: unknown): string {
  const entries = getChildEntries(value);
  const isArray = Array.isArray(value);

  const shown = entries
    .slice(0, 2)
    .map(([key, child]) =>
      isArray ? previewScalar(child, 20) : `${key}: ${previewScalar(child, 15)}`
    );

  const text = shown.join(', ') + (entries.length > 2 ? ', …' : '');
  return truncate(text, 60);
}
