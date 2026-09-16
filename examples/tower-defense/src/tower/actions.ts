import { createActions, type Entity } from 'koota';
import { Game } from '../game/traits';
import { laneOrigin, padPosition } from '../setup/setups';
import { Scenario } from '../setup/traits';
import { transformActions } from '../transform/actions';
import { Position } from '../transform/traits';
import { BuildPads, Tower, TowerParts, type TowerKind } from './traits';

export function towerCost(kind: TowerKind) {
  return kind === 'cannon' ? 75 : kind === 'flame' ? 80 : 65;
}

export function upgradeCost(level: number) {
  return 65 + level * 35;
}

export const towerActions = createActions((world) => ({
  buildTower: (lane: number, pad: number, kind: TowerKind): Entity | undefined => {
    const config = world.get(Scenario)!;
    const game = world.get(Game)!;
    const pads = world.get(BuildPads)!;
    if (
      !['cannon', 'flame', 'frost'].includes(kind) ||
      !Number.isInteger(lane) ||
      !Number.isInteger(pad) ||
      lane < 0 ||
      lane >= config.lanes ||
      pad < 0 ||
      pad >= 16 ||
      pads.has(lane * 16 + pad) ||
      game.phase !== 'running' ||
      game.gold < towerCost(kind)
    )
      return;
    game.gold -= towerCost(kind);
    const origin = laneOrigin(config, lane);
    const point = padPosition(pad);
    const x = origin.x + point.x;
    const z = origin.z + point.z;
    const { spawnNode } = transformActions(world);
    const color = kind === 'cannon' ? '#42bfa5' : kind === 'flame' ? '#ef9a51' : '#6bafed';
    const root = spawnNode({ x, y: 0.35, z }, { sx: 1.6, sy: 0.65, sz: 1.6, color: '#344e51' });
    root.add(
      Position({ x, y: 0.35, z }),
      Tower({
        kind,
        lane,
        pad,
        range:
          (kind === 'cannon' ? 8.5 : kind === 'flame' ? 6 : 7) *
          (config.setup === 'target-turnover' ? 0.7 : 1),
        interval: kind === 'cannon' ? 0.9 : kind === 'flame' ? 0.7 : 0.85,
        damage: kind === 'cannon' ? 24 : kind === 'flame' ? 3 : 2,
        splash: kind === 'cannon' ? (config.setup === 'swarm-explosions' ? 3.5 : 2.3) : 2.6,
      })
    );
    const platform = spawnNode({ y: 0.55 }, { sx: 1.3, sy: 0.5, sz: 1.3, color }, root);
    const mount = spawnNode({ y: 0.35 }, { sx: 1, sy: 0.65, sz: 0.9, color }, platform);
    const barrels = [-0.3, 0.3].map((offset) =>
      spawnNode(
        { x: offset, y: 0, z: 0.65 },
        { sx: 0.22, sy: 0.22, sz: 1.35, color: '#263b42' },
        mount
      )
    );
    const muzzles = barrels.map((barrel) =>
      spawnNode({ z: 0.72 }, { sx: 0.3, sy: 0.3, sz: 0.12, color }, barrel)
    );
    const radar = spawnNode(
      { x: -0.6, y: 0.7, z: -0.35 },
      { sx: 0.1, sy: 0.6, sz: 0.4, color: '#d6e8c6' },
      platform
    );
    root.add(TowerParts({ platform, mount, barrels, muzzles, radar }));
    pads.set(lane * 16 + pad, root);
    game.message = `${kind[0].toUpperCase()}${kind.slice(1)} built`;
    return root;
  },
  upgradeTower: (entity: Entity) => {
    const tower = world.has(entity) && entity.get(Tower);
    const game = world.get(Game)!;
    if (
      !tower ||
      tower.level >= 3 ||
      game.phase !== 'running' ||
      game.gold < upgradeCost(tower.level)
    )
      return false;
    game.gold -= upgradeCost(tower.level);
    entity.set(Tower, {
      level: tower.level + 1,
      damage: tower.damage * 1.4,
      range: tower.range + 0.7,
      interval: tower.interval * 0.85,
    });
    game.message = `${tower.kind[0].toUpperCase()}${tower.kind.slice(1)} upgraded to level ${tower.level + 1}`;
    return true;
  },
}));
