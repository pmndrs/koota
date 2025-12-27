import { initStats } from '@app/bench-tools';
import { useEffect, useMemo } from 'react';

export function useStats(extras: Parameters<typeof initStats>[0]) {
	const api = useMemo(() => initStats(extras), [extras]);

	useEffect(() => {
		api.create();
		return () => api.destroy();
	});

	return api;
}
