import { useEffect, useRef, useState } from 'react';
import {
  getChildEntries,
  getConstructorName,
  getValueKind,
  previewChildren,
  truncate,
  type ValueKind,
} from '../../model/value-preview';
import { Chevron } from '../../ui/icons';
import styles from './object-inspector.module.css';

export type ValuePath = string[];

interface ObjectInspectorProps {
  data: unknown;
  name?: string;
  depth?: number;
  /** Path from the root value to this one; used to address edits. */
  path?: ValuePath;
  /** Enables double-click editing of primitive leaves; receives the leaf's path and new value. */
  onEdit?: (path: ValuePath, value: unknown) => void;
  /** Whether this leaf may be written to, as decided by its parent. */
  editable?: boolean;
  /** Start open (root only; nested values start collapsed). */
  defaultExpanded?: boolean;
  /** Skip the root's own row and list its children directly. */
  hideRoot?: boolean;
}

const NO_PATH: ValuePath = [];

/** Own, writable data properties can be edited; getters, frozen objects and the like cannot. */
function canEditChild(parent: unknown, key: string): boolean {
  if (typeof parent !== 'object' || parent === null || Object.isFrozen(parent)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(parent, key);
  return descriptor !== undefined && 'value' in descriptor && descriptor.writable !== false;
}

function isPrimitiveKind(kind: ValueKind): boolean {
  return kind === 'number' || kind === 'string' || kind === 'boolean';
}

/**
 * A collapsible tree view of any value, in the style of a browser console. With `onEdit`,
 * primitive leaves can be clicked and retyped, Enter or blur commits, Escape cancels.
 */
export function ObjectInspector({
  data,
  name,
  depth = 0,
  path = NO_PATH,
  onEdit,
  editable = false,
  defaultExpanded = false,
  hideRoot = false,
}: ObjectInspectorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditing, setIsEditing] = useState(false);

  const kind = getValueKind(data);
  const children = getChildEntries(data);
  const hasChildren = children.length > 0;
  const showChildren = hideRoot || (isExpanded && hasChildren);
  const isEditableLeaf = editable && isPrimitiveKind(kind) && onEdit !== undefined;

  // Clicking anywhere on the row does the one thing the row can do: open or edit.
  const onRowClick = () => {
    if (hasChildren) setIsExpanded((prev) => !prev);
    else if (isEditableLeaf) setIsEditing(true);
  };

  const renderedChildren = showChildren
    ? children.map(([key, child]) => (
        <ObjectInspector
          key={key}
          data={child}
          name={key}
          depth={hideRoot ? depth : depth + 1}
          path={[...path, key]}
          onEdit={onEdit}
          editable={onEdit !== undefined && canEditChild(data, key)}
        />
      ))
    : null;

  if (hideRoot) return <div className={styles.inspector}>{renderedChildren}</div>;

  return (
    <div className={`${styles.inspector} ${depth > 0 ? styles.nested : ''}`}>
      <div
        className={`${styles.row} ${isEditableLeaf ? styles.rowEditable : ''}`}
        onClick={onRowClick}
      >
        {name && <span className={styles.name}>{name}</span>}
        {hasChildren && <Chevron open={isExpanded} />}
        <span className={`${styles.slot} ${name ? '' : styles.slotStart}`}>
          {isEditableLeaf ? (
            <EditableLeaf
              value={data as number | string | boolean}
              editing={isEditing}
              onCommit={(v) => onEdit!(path, v)}
              onDone={() => setIsEditing(false)}
            />
          ) : (
            <Value data={data} kind={kind} collapsed={!isExpanded} />
          )}
        </span>
      </div>
      {renderedChildren}
    </div>
  );
}

/* Leaf editing -------------------------------------------------------------------------------- */

type Primitive = number | string | boolean;

/** Parse typed text back into the leaf's current type; undefined means "leave it alone". */
function parseAs(current: Primitive, text: string): Primitive | undefined {
  switch (typeof current) {
    case 'number': {
      if (text.trim() === '') return undefined;
      const n = Number(text);
      return Number.isNaN(n) ? undefined : n;
    }
    case 'boolean': {
      const t = text.trim().toLowerCase();
      if (t === 'true' || t === '1') return true;
      if (t === 'false' || t === '0') return false;
      return undefined;
    }
    default:
      return text;
  }
}

interface EditableLeafProps {
  value: Primitive;
  editing: boolean;
  onCommit: (value: Primitive) => void;
  onDone: () => void;
}

function EditableLeaf({ value, editing, onCommit, onDone }: EditableLeafProps) {
  // While editing, the leaf freezes at the value that was clicked; live updates keep flowing
  // to the rest of the tree but never into the input.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      setDraft(String(value));
    } else {
      setDraft(null);
    }
    // the draft is seeded from the value at the moment editing starts, not on later changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (draft !== null) inputRef.current?.select();
  }, [draft !== null]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft === null ? undefined : parseAs(value, draft);
    onDone();
    if (next !== undefined && next !== value) onCommit(next);
  };

  const cancel = () => {
    committedRef.current = true;
    onDone();
  };

  if (!editing || draft === null) {
    return (
      <span className={`${styles.leaf} ${kindClass(value)}`} title="Click to edit">
        {typeof value === 'string' ? `"${truncate(value, 50)}"` : String(value)}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      className={styles.leafInput}
      style={{ width: `${Math.max(3, draft.length + 1)}ch` }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') cancel();
        e.stopPropagation();
      }}
    />
  );
}

function kindClass(value: Primitive): string {
  return typeof value === 'string' ? styles.string : '';
}

/* Read-only rendering -------------------------------------------------------------------------- */

function Value({ data, kind, collapsed }: { data: unknown; kind: ValueKind; collapsed: boolean }) {
  switch (kind) {
    case 'null':
    case 'undefined':
      return <span className={styles.quiet}>{kind}</span>;
    case 'string':
      return <span className={styles.string}>"{truncate(data as string, 50)}"</span>;
    case 'function':
      return <span className={styles.quiet}>ƒ {(data as () => void).name || 'anonymous'}()</span>;
    case 'array':
      return (
        <span className={styles.value}>
          Array({(data as unknown[]).length})
          {collapsed && (data as unknown[]).length > 0 && (
            <span className={styles.preview}> [{previewChildren(data)}]</span>
          )}
        </span>
      );
    case 'object':
      return (
        <span className={styles.value}>
          {getConstructorName(data as object)}
          {collapsed && getChildEntries(data).length > 0 && (
            <span className={styles.preview}> {`{${previewChildren(data)}}`}</span>
          )}
        </span>
      );
    default:
      return <span>{truncate(String(data), 50)}</span>;
  }
}
