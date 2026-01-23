import { useQuery, useTrait } from 'koota/react';
import type { Entity } from 'koota';
import { IsRemote, ClientId, RemoteCursor, User } from '../../core/traits';

// Generate a consistent color from client ID
function getClientColor(clientId: string): string {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
        hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
}

// Extract display name from client ID (e.g., "client-3" -> "3")
function getClientLabel(clientId: string): string {
    const match = clientId.match(/client-(\d+)/);
    return match ? match[1] : clientId;
}

export function RemoteCursorRenderer() {
    const users = useQuery(IsRemote, RemoteCursor);

    return (
        <div className="remote-cursors">
            {users.map((entity) => (
                <RemoteCursorView key={entity.id()} entity={entity} />
            ))}
        </div>
    );
}

interface RemoteCursorViewProps {
    entity: Entity;
}

function RemoteCursorView({ entity }: RemoteCursorViewProps) {
    const clientIdTrait = useTrait(entity, ClientId);
    const user = useTrait(entity, User);
    const cursor = useTrait(entity, RemoteCursor);

    if (!clientIdTrait || !cursor) return null;

    const clientId = clientIdTrait.id;
    const color = getClientColor(clientId);
    const fallbackLabel = `User ${getClientLabel(clientId)}`;
    const displayName = user?.name?.trim() ? user.name : fallbackLabel;

    return (
        <div
            className="remote-cursor"
            style={{
                position: 'fixed',
                left: cursor.x,
                top: cursor.y,
                pointerEvents: 'none',
                zIndex: 9999,
                transform: 'translate(-2px, -2px)',
            }}
        >
            {/* Cursor icon */}
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            >
                <path
                    d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z"
                    fill={color}
                    stroke="white"
                    strokeWidth="1.5"
                />
            </svg>
            {/* Label */}
            <div
                style={{
                    position: 'absolute',
                    left: 16,
                    top: 16,
                    backgroundColor: color,
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
            >
                {displayName}
            </div>
        </div>
    );
}
