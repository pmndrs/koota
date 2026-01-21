import type { ReactNode } from 'react';

export function Section({ children }: { children: ReactNode }) {
    return <div className="toolbar-section">{children}</div>;
}
