import {World} from 'koota';
import {useActions} from '../actions';
// @ts-ignore
import {Time} from '../traits';
// @ts-ignore
import {mapLinear} from "three/src/math/MathUtils";

//const SPAWN_INTERVAL = 0.15;
let accumulatedTime = 0;
let total = 0;


export const spawnEnemies = ({ world }: { world: World }) => {

	const { delta } = world.get(Time);
	const { spawnEnemy } = useActions.get(world);

	accumulatedTime += delta;
	total += delta;

	const currentInterval = mapLinear(1 + Math.cos(total), 0, 2, 0.4, 0.025);
	//console.log(currentInterval);

	if (accumulatedTime >= currentInterval) {
		if (currentInterval < delta) {
			spawnEnemy();
		}
		spawnEnemy();
		accumulatedTime = 0;
	}
};
