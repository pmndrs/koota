import { createContext, useContext } from 'react';
import { useWorld } from 'koota/react';
import type { createSyncClient } from './sync-client';
import { SyncClientRef } from '../startup';

export type SyncClient = ReturnType<typeof createSyncClient>;

// Legacy context (kept for compatibility)
export const SyncContext = createContext<SyncClient | null>(null);

/**
 * Get the sync client from the world.
 * Preferred method - works anywhere with world access.
 */
export function useSyncClient(): SyncClient {
	const world = useWorld();
	const client = world.get(SyncClientRef);
	if (!client) {
		throw new Error('SyncClient not initialized. Is <Startup /> mounted?');
	}
	return client;
}

/**
 * Get the sync client, or null if not yet initialized.
 */
export function useSyncClientMaybe(): SyncClient | null {
	const world = useWorld();
	return world.get(SyncClientRef) ?? null;
}
