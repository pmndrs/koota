import { Canvas } from '@react-three/fiber';
import { useActions } from 'koota/react';
import { useCallback } from 'react';
import { actions } from './actions';
import { Scene } from './components/Scene';
import { Toolbar } from './components/Toolbar';
import { Frameloop } from './frameloop';
import { Startup } from './startup';

export function App() {
	const { selectShape } = useActions(actions);

	const handlePointerMissed = useCallback(() => {
		selectShape(null);
	}, [selectShape]);

	return (
		<>
			<Canvas
				camera={{ position: [0, 5, 10], fov: 50 }}
				onPointerMissed={handlePointerMissed}
			>
				<Scene />
			</Canvas>
			<Toolbar />
			<Frameloop />
			<Startup />
		</>
	);
}
