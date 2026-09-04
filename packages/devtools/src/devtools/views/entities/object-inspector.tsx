import { useState } from 'react';
import {
  getChildEntries,
  getConstructorName,
  getValueKind,
  previewChildren,
  truncate,
} from '../../model/value-preview';
import styles from './object-inspector.module.css';

interface ObjectInspectorProps {
  data: unknown;
  name?: string;
  depth?: number;
}

/** A collapsible tree view of any value, in the style of a browser console. */
export function ObjectInspector({ data, name, depth = 0 }: ObjectInspectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const kind = getValueKind(data);
  const children = getChildEntries(data);
  const isContainer = kind === 'object' || kind === 'array';
  const hasChildren = children.length > 0;

  return (
    <div className={`${styles.inspector} ${depth > 0 ? styles.nested : ''}`}>
      <div className={styles.row} onClick={() => hasChildren && setIsExpanded((prev) => !prev)}>
        {isContainer && (
          <span className={styles.arrow}>{hasChildren && (isExpanded ? '▼' : '▶')}</span>
        )}
        {name && <span className={styles.name}>{name}: </span>}
        <Value data={data} kind={kind} collapsed={!isExpanded} />
      </div>

      {isExpanded &&
        children.map(([key, child]) => (
          <ObjectInspector key={key} data={child} name={key} depth={depth + 1} />
        ))}
    </div>
  );
}

function Value({
  data,
  kind,
  collapsed,
}: {
  data: unknown;
  kind: ReturnType<typeof getValueKind>;
  collapsed: boolean;
}) {
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
        <span>
          Array({(data as unknown[]).length})
          {collapsed && (data as unknown[]).length > 0 && (
            <span className={styles.preview}> [{previewChildren(data)}]</span>
          )}
        </span>
      );
    case 'object':
      return (
        <span>
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
