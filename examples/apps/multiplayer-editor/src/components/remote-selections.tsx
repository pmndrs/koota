import { useQuery } from 'koota/react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Presence, Position, Scale } from '../traits';
import { useSyncClient } from '../sync/sync-context';

export function RemoteSelections() {
	const syncClient = useSyncClient();
	const presenceEntities = useQuery(Presence);

	return (
		<>
			{presenceEntities.map((entity) => {
				const presence = entity.get(Presence);
				if (!presence || !presence.selectedNetId) return null;

				const selectedEntity = syncClient.getEntity(presence.selectedNetId);
				if (!selectedEntity || !selectedEntity.isAlive()) return null;

				return (
					<RemoteSelectionOutline
						key={presence.clientId}
						targetEntity={selectedEntity}
						color={presence.color}
					/>
				);
			})}
		</>
	);
}

interface RemoteSelectionOutlineProps {
	targetEntity: { get: (trait: any) => any; isAlive: () => boolean };
	color: string;
}

function RemoteSelectionOutline({ targetEntity, color }: RemoteSelectionOutlineProps) {
	const groupRef = useRef<THREE.Group>(null);

	useFrame(() => {
		if (!groupRef.current || !targetEntity.isAlive()) return;

		const position = targetEntity.get(Position);
		const scale = targetEntity.get(Scale);

		if (position) {
			groupRef.current.position.set(position.x, position.y, position.z);
		}
		if (scale) {
			groupRef.current.scale.set(scale.x * 1.1, scale.y * 1.1, scale.z * 1.1);
		}
	});

	return (
		<group ref={groupRef}>
			<lineSegments>
				<edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
				<lineBasicMaterial color={color} linewidth={2} transparent opacity={0.8} />
			</lineSegments>
		</group>
	);
}
