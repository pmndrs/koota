import type { Tab } from '../state/nav';
import { Button } from '../ui/button';
import { EntityIcon, GraphIcon, TraitIcon } from '../ui/icons';
import { usePanel } from '../ui/panel/panel';
import styles from './header.module.css';

const TABS = [
  { tab: 'entities', title: 'Entities', Icon: EntityIcon },
  { tab: 'traits', title: 'Traits', Icon: TraitIcon },
  { tab: 'graph', title: 'Relation Graph', Icon: GraphIcon },
] as const;

interface HeaderProps {
  tab: Tab;
  counts: Record<Tab, number>;
  onShowTab: (tab: Tab) => void;
}

export function Header({ tab, counts, onShowTab }: HeaderProps) {
  const { isOpen, toggleOpen } = usePanel();

  return (
    <>
      <span className={styles.title}>Koota</span>
      <div className={styles.tabs}>
        {TABS.map(({ tab: target, title, Icon }) => (
          <Button
            key={target}
            active={tab === target}
            title={title}
            onClick={() => onShowTab(target)}
          >
            <Icon size={12} />
            <span>{counts[target]}</span>
          </Button>
        ))}
      </div>
      <Button onClick={toggleOpen} title={isOpen ? 'Collapse' : 'Expand'}>
        {isOpen ? '−' : '+'}
      </Button>
    </>
  );
}
