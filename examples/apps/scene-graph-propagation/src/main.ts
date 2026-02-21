import { initStats } from '@app/bench-tools';
import {
    allEntities,
    CONFIG,
    init,
    IsGroup,
    IsObject,
    resultingDepth,
    schedule,
    world,
} from '@sim/scene-graph-propagation';
import './styles.css';

init({ world });

const leafCount = world.query(IsObject).length;
const groupCount = world.query(IsGroup).length;

const { updateStats, measure, create } = initStats({
    Entities: () => world.entities.length,
    Groups: () => groupCount,
    'Leaf objects': () => leafCount,
    'Dirty per frame': () => Math.max(1, Math.floor(allEntities.length * CONFIG.dirtyFraction)),
    Depth: () => resultingDepth,
    'Bottom leaves': () => `${(CONFIG.bottomLeafFraction * 100).toFixed(0)}% of target`,
});
create();

const main = () => {
    measure(() => {
        schedule.run({ world });
        updateStats();
    });
    requestAnimationFrame(main);
};

requestAnimationFrame(main);
