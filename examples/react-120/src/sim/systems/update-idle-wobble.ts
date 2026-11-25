import { Not, type World } from 'koota';
import { actions } from '../actions';
import { IsIdle, Timer, WobblesOnIdle } from '../traits';

export function updateIdleWobble(world: World) {
  const { wobbleBall } = actions(world);

  world.query(WobblesOnIdle, IsIdle, Not(Timer)).each((wobblesOnIdle, entity) => {
    const { cooldown, strength } = wobblesOnIdle;
    wobbleBall(entity, { strength });
    entity.add(Timer({ duration: cooldown, remaining: cooldown }));
  });
}
