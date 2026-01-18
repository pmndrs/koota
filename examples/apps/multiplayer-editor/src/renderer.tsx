import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Toolbar } from './components/toolbar';
import { ShapeRenderer } from './components/shape-renderer';
import { RemoteSelections } from './components/remote-selections';
import { PresenceAvatars } from './components/presence-avatars';
import { StatusBar } from './components/status-bar';
import { useSyncClient } from './sync/sync-context';

/**
 * Renderer contains all visual output - Canvas and HTML overlays.
 * Completely separate from editor logic.
 */
export function Renderer() {
	const syncClient = useSyncClient();

	return (
		<>
			{/* 3D View */}
			<Canvas onPointerMissed={() => syncClient.clearSelection()}>
				<color attach="background" args={['#1a1a2e']} />
				<ambientLight intensity={0.4} />
				<directionalLight position={[10, 10, 10]} intensity={0.6} />
				<pointLight position={[-10, -10, -10]} intensity={0.3} />

				<PerspectiveCamera makeDefault position={[5, 5, 5]} />
				<OrbitControls makeDefault />

				<Grid
					args={[20, 20]}
					cellSize={1}
					cellThickness={0.5}
					cellColor="#2a2a4e"
					sectionSize={5}
					sectionThickness={1}
					sectionColor="#3a3a5e"
					fadeDistance={30}
					infiniteGrid
				/>

				<ShapeRenderer />
				<RemoteSelections />
			</Canvas>

			{/* HTML Overlays */}
			<Toolbar />
			<PresenceAvatars />
			<StatusBar />
		</>
	);
}
