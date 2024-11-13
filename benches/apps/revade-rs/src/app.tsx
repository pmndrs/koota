import { Canvas } from '@react-three/fiber';
import { EnemyRenderer } from './components/enemy-renderer';
import { Player } from './components/player';

export function App() {
	return (
		<Canvas camera={{ fov: 50, position: [0, 0, 50] }}>
			<Player />
			<EnemyRenderer />
		</Canvas>
	);
}
