import { EntityIcon, WorldIcon } from '../../ui/icons';
import styles from './entity-glyph.module.css';

/** The icon that stands for an entity everywhere in the devtools. */
export function EntityGlyph({ isWorld, size = 12 }: { isWorld: boolean; size?: number }) {
  const Icon = isWorld ? WorldIcon : EntityIcon;
  return <Icon size={size} className={styles.glyph} />;
}
