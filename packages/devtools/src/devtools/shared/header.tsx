import { useCallback } from 'react';
import { Button } from './button';
import styles from './header.module.css';
import { EntityIcon, GraphIcon, InspectIcon, TraitIcon, WorldIcon } from './icons';
import { usePanel } from './panel';

export type Tab = 'worlds' | 'info' | 'traits' | 'entities' | 'graph';

interface HeaderProps {
    traitCount?: number;
    entityCount?: number;
    relationCount?: number;
    worldCount?: number;
    activeTab: Tab;
    canGoBack: boolean;
    isInspecting: boolean;
    showWorldsTab?: boolean;
    worldLabel?: string;
    onTabChange: (tab: Tab) => void;
    onBack: () => void;
    onToggleInspect: () => void;
}

export function Header({
    traitCount,
    entityCount,
    relationCount,
    worldCount,
    activeTab,
    canGoBack,
    isInspecting,
    showWorldsTab,
    worldLabel,
    onTabChange,
    onBack,
    onToggleInspect,
}: HeaderProps) {
    const { isOpen, setIsOpen } = usePanel();
    const toggle = useCallback(() => setIsOpen((prev) => !prev), [setIsOpen]);

    const isWorldsList = activeTab === 'worlds';

    return (
        <>
            {isWorldsList ? (
                <span className={styles.title}>Koota</span>
            ) : worldLabel ? (
                <button
                    className={`${styles.title} ${styles.titleClickable} ${activeTab === 'info' ? styles.titleActive : ''}`}
                    onClick={() => onTabChange('info')}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="World overview"
                >
                    {worldLabel}
                </button>
            ) : (
                <span className={styles.title}>Koota</span>
            )}

            <div className={styles.headerLeft}>
                <div className={styles.headerContent}>
                    {isWorldsList ? (
                        <div className={styles.tabs}>
                            <button
                                className={`${styles.tab} ${styles.tabActive}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Worlds"
                            >
                                <WorldIcon size={12} />
                                <span>{worldCount ?? 0}</span>
                            </button>
                        </div>
                    ) : (
                        <div className={styles.tabs}>
                            {showWorldsTab && (
                                <button
                                    className={styles.tab}
                                    onClick={() => onTabChange('worlds')}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title="Back to worlds"
                                >
                                    <WorldIcon size={12} />
                                </button>
                            )}
                            <button
                                className={`${styles.tab} ${
                                    activeTab === 'entities' ? styles.tabActive : ''
                                }`}
                                onClick={() => onTabChange('entities')}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Entities"
                            >
                                <EntityIcon size={12} />
                                <span>{entityCount}</span>
                            </button>
                            <button
                                className={`${styles.tab} ${
                                    activeTab === 'traits' ? styles.tabActive : ''
                                }`}
                                onClick={() => onTabChange('traits')}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Traits"
                            >
                                <TraitIcon size={12} />
                                <span>{traitCount}</span>
                            </button>
                            <button
                                className={`${styles.tab} ${
                                    activeTab === 'graph' ? styles.tabActive : ''
                                }`}
                                onClick={() => onTabChange('graph')}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Relation Graph"
                            >
                                <GraphIcon size={12} />
                                <span>{relationCount}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className={styles.headerActions}>
                {!isWorldsList && (
                    <Button
                        onClick={onToggleInspect}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Inspect element"
                        active={isInspecting}
                    >
                        <InspectIcon size={12} />
                    </Button>
                )}
                <Button
                    onClick={toggle}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={isOpen ? 'Collapse' : 'Expand'}
                >
                    {isOpen ? '−' : '+'}
                </Button>
            </div>
        </>
    );
}
