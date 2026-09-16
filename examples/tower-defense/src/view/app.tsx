import type { Entity, World } from 'koota';
import { useEffect, useMemo, useState } from 'react';
import { IsEnemy } from '../enemy/traits';
import { gameActions } from '../game/actions';
import { Clock, Game } from '../game/traits';
import { Metrics, type Workload } from '../metrics/traits';
import { stepGame } from '../schedule';
import {
  setups,
  type EffectMode,
  type QueryMode,
  type Scale,
  type SetupId,
  type SetupOptions,
} from '../setup/setups';
import { Scenario } from '../setup/traits';
import { towerActions, towerCost, upgradeCost } from '../tower/actions';
import { BuildPads, Tower, type TowerKind } from '../tower/traits';
import { composeLocalMatrices, propagateWorldTransforms } from '../transform/systems';
import { Wave } from '../wave/traits';
import { createGame } from '../world';
import { GameRenderer } from './renderer';
import './style.css';

export function App() {
  const [run, setRun] = useState<{ options: SetupOptions; key: number }>({
    options: {
      setup: 'balanced',
      scale: 1,
      seed: 42,
      automatic: true,
      queryMode: 'mixed',
      effectMode: 'overlapping',
    },
    key: 0,
  });
  const [devOpen, setDevOpen] = useState(false);
  return (
    <Session
      key={run.key}
      options={run.options}
      devOpen={devOpen}
      onDevOpen={setDevOpen}
      onRestart={(options = run.options) => setRun({ options, key: run.key + 1 })}
    />
  );
}

function Session({
  options,
  devOpen,
  onDevOpen,
  onRestart,
}: {
  options: SetupOptions;
  devOpen: boolean;
  onDevOpen: (open: boolean) => void;
  onRestart: (options?: SetupOptions) => void;
}) {
  const world = useMemo(() => {
    const world = createGame(options);
    world.get(Game)!.paused = !options.automatic;
    return world;
  }, [options]);
  const [pending, setPending] = useState(options);
  const [lane, setLane] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [kind, setKind] = useState<TowerKind>('cannon');
  const [selected, setSelected] = useState<Entity>();
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((value) => value + 1), 250);
    return () => {
      window.clearInterval(timer);
      world.destroy();
      document.body.style.cursor = '';
    };
  }, [world]);
  useEffect(() => {
    const metrics = world.get(Metrics)!;
    metrics.enabled = devOpen;
    metrics.systems.clear();
    metrics.frameMs = 0;
    metrics.ticks = 0;
  }, [world, devOpen]);
  const config = world.get(Scenario)!;
  const game = world.get(Game)!;
  const clock = world.get(Clock)!;
  const wave = world.get(Wave)!;
  const selection = selected !== undefined && world.has(selected) ? selected.get(Tower) : undefined;
  const act = () => refresh((value) => value + 1);
  const onPad = (pad: number) => {
    const existing = world.get(BuildPads)!.get(lane * 16 + pad);
    if (existing !== undefined) setSelected(existing);
    else {
      const entity = towerActions(world).buildTower(lane, pad, kind);
      if (entity !== undefined) {
        setSelected(entity);
        // Make a newly placed tower visible while the battle is paused.
        composeLocalMatrices(world);
        propagateWorldTransforms(world);
      } else if (game.phase === 'running') game.message = `A ${kind} costs ${towerCost(kind)} gold`;
    }
    act();
  };

  return (
    <main className="app-shell">
      <section className="battlefield" aria-label="3D battlefield">
        <GameRenderer
          world={world}
          lane={lane}
          speed={speed}
          selected={selected}
          onPad={onPad}
          onTower={setSelected}
        />
        {game.phase !== 'running' && (
          <div className="outcome">
            <div>
              <h1>{game.phase === 'won' ? 'Victory' : 'Defeat'}</h1>
              <button
                className="primary"
                title="Play again"
                aria-label="Play again"
                onClick={() => onRestart()}
              >
                ↻
              </button>
            </div>
          </div>
        )}
      </section>

      <header className="topbar">
        <div className="scoreboard">
          <span
            title="Base integrity"
            aria-label={`Base integrity ${game.health} of ${game.maxHealth}`}
            className={game.health < game.maxHealth * 0.3 ? 'danger' : ''}
          >
            <span className="score-icon">♥</span>
            {Math.max(0, Math.round((game.health / game.maxHealth) * 100))}
            <small>%</small>
          </span>
          <span
            className="gold"
            title={`${game.gold.toLocaleString()} gold`}
            aria-label={`${game.gold} gold`}
          >
            <span className="score-icon">◆</span>
            {game.gold >= 10000 ? `${(game.gold / 1000).toFixed(1)}k` : game.gold.toLocaleString()}
          </span>
          <span title="Wave" aria-label={`Wave ${wave.number} of ${config.waveCount}`}>
            <span className="score-icon">⚑</span>
            {wave.number}
            <small>/{config.waveCount}</small>
          </span>
        </div>
        <div className="run-controls">
          <button
            className={game.paused ? 'primary' : ''}
            title={game.paused ? (clock.tick === 0 ? 'Start battle' : 'Resume') : 'Pause'}
            aria-label={game.paused ? (clock.tick === 0 ? 'Start battle' : 'Resume') : 'Pause'}
            disabled={game.phase !== 'running'}
            onClick={() => {
              gameActions(world).setPaused(!game.paused);
              act();
            }}
          >
            {game.paused ? '▶' : 'Ⅱ'}
          </button>
          <select
            aria-label="Game speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <button title="Restart battle" aria-label="Restart battle" onClick={() => onRestart()}>
            ↻
          </button>
        </div>
      </header>

      <footer className="build-bar">
        <div className="tower-options">
          {(['cannon', 'flame', 'frost'] as TowerKind[]).map((value) => (
            <button
              key={value}
              aria-pressed={value === kind}
              aria-label={`Build ${value}, ${towerCost(value)} gold`}
              title={
                value === 'cannon'
                  ? 'Splash damage. Select, then click a pad.'
                  : value === 'flame'
                    ? 'Burning damage. Select, then click a pad.'
                    : 'Slows enemies. Select, then click a pad.'
              }
              disabled={game.gold < towerCost(value) || game.phase !== 'running'}
              className={`tower-card ${value} ${value === kind ? 'selected' : ''}`}
              onClick={() => {
                setKind(value);
                setSelected(undefined);
              }}
            >
              <span className="tower-glyph">
                {value === 'cannon' ? '▰' : value === 'flame' ? '♨' : '❄'}
              </span>
              <span>
                <strong>{value}</strong>
                <small>{towerCost(value)}</small>
              </span>
            </button>
          ))}
        </div>
        {selection && (
          <div
            className="tower-details"
            title={`${selection.damage.toFixed(0)} damage · ${selection.range.toFixed(1)} range`}
          >
            <span>
              {selection.kind}
              <small>{'★'.repeat(selection.level)}</small>
            </span>
            <button
              title="Upgrade tower"
              aria-label={
                selection.level >= 3
                  ? 'Maximum level'
                  : `Upgrade tower, ${upgradeCost(selection.level)} gold`
              }
              disabled={
                selection.level >= 3 ||
                game.gold < upgradeCost(selection.level) ||
                game.phase !== 'running'
              }
              onClick={() => {
                towerActions(world).upgradeTower(selected!);
                act();
              }}
            >
              {selection.level >= 3 ? '✓' : `↑ ${upgradeCost(selection.level)}`}
            </button>
          </div>
        )}
      </footer>

      {devOpen ? (
        <aside className="devtools" aria-label="Developer tools">
          <div className="dev-heading">
            <span aria-hidden="true">&lt;/&gt;</span>
            <button
              onClick={() => onDevOpen(false)}
              title="Minimize developer tools"
              aria-label="Minimize developer tools"
            >
              −
            </button>
          </div>
          <div className="dev-body">
            <select
              aria-label="World setup"
              value={pending.setup}
              onChange={(event) => setPending({ ...pending, setup: event.target.value as SetupId })}
            >
              {setups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="settings-row">
              <div>
                <label htmlFor="scale">Scale</label>
                <select
                  id="scale"
                  value={pending.scale}
                  onChange={(event) =>
                    setPending({ ...pending, scale: Number(event.target.value) as Scale })
                  }
                >
                  {[1, 4, 16, 64].map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}×
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seed">Seed</label>
                <input
                  id="seed"
                  type="number"
                  step="1"
                  value={pending.seed}
                  onChange={(event) => setPending({ ...pending, seed: Number(event.target.value) })}
                />
              </div>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={pending.automatic}
                onChange={(event) => setPending({ ...pending, automatic: event.target.checked })}
              />{' '}
              Autoplay
            </label>
            <details>
              <summary>Options</summary>
              <label htmlFor="query">Query</label>
              <select
                id="query"
                value={pending.queryMode}
                onChange={(event) =>
                  setPending({ ...pending, queryMode: event.target.value as QueryMode })
                }
              >
                <option value="required">Required</option>
                <option value="not">Not</option>
                <option value="or">Or</option>
                <option value="mixed">Not + Or</option>
              </select>
              <label htmlFor="effects">Effects</label>
              <select
                id="effects"
                value={pending.effectMode}
                onChange={(event) =>
                  setPending({ ...pending, effectMode: event.target.value as EffectMode })
                }
              >
                <option value="overlapping">Fire + frost</option>
                <option value="single">Frost</option>
              </select>
            </details>
            <button
              className="full-width"
              title="Apply setup and restart"
              disabled={!Number.isSafeInteger(pending.seed)}
              onClick={() => onRestart(pending)}
            >
              Apply ↻
            </button>
            <div className="settings-row">
              <div>
                <label htmlFor="lane">Lane</label>
                <select
                  id="lane"
                  value={lane}
                  onChange={(event) => {
                    setLane(Number(event.target.value));
                    setSelected(undefined);
                  }}
                >
                  {Array.from({ length: config.lanes }, (_, index) => (
                    <option value={index} key={index}>
                      {index + 1} / {config.lanes}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="step-button"
                title="Step one tick"
                aria-label="Step one tick"
                disabled={game.phase !== 'running'}
                onClick={() => {
                  gameActions(world).setPaused(true);
                  stepGame(world, true);
                  act();
                }}
              >
                ▸│
              </button>
            </div>
            <div className="entity-counts">
              <span title="Simulated raindrops">{config.rainCount.toLocaleString()} rain</span>
              <span>{world.query(IsEnemy).length.toLocaleString()} enemies</span>
            </div>
            <WorkloadTimings world={world} />
          </div>
        </aside>
      ) : (
        <button
          className="dev-toggle"
          title="Developer tools"
          aria-label="Developer tools"
          onClick={() => onDevOpen(true)}
        >
          &lt;/&gt;
        </button>
      )}
    </main>
  );
}

function WorkloadTimings({ world }: { world: World }) {
  const metrics = world.get(Metrics)!;
  const groups: { key: Workload; label: string }[] = [
    { key: 'iteration', label: 'Iteration' },
    { key: 'churn', label: 'Status' },
    { key: 'traversal', label: 'Transforms' },
    { key: 'graph', label: 'Relations' },
    { key: 'terms', label: 'Terms' },
    { key: 'bulk', label: 'Bulk mutation' },
    { key: 'structural', label: 'Spawn / destroy' },
  ];
  return (
    <section className="timings" aria-label="Workload timings">
      <div
        className="timing-label"
        title="Smoothed CPU time. Timings stop when this panel is minimized."
      >
        ms / tick
      </div>
      {groups.map((group) => {
        const systems = [...metrics.systems].filter(([, item]) => item.workload === group.key);
        return (
          <div
            className="metric-row"
            key={group.key}
            title={systems.map(([name]) => name).join(', ')}
          >
            <span>{group.label}</span>
            <strong>{systems.reduce((sum, [, item]) => sum + item.meanMs, 0).toFixed(3)}</strong>
          </div>
        );
      })}
      <div className="metric-row total">
        <span>Total</span>
        <strong>{metrics.frameMs.toFixed(3)}</strong>
      </div>
      <div className="metric-row" title="CPU render synchronization, excluding GPU drawing">
        <span>Render · ms / frame</span>
        <strong>
          {[...metrics.systems.values()]
            .filter((item) => item.workload === 'render')
            .reduce((sum, item) => sum + item.meanMs, 0)
            .toFixed(3)}
        </strong>
      </div>
    </section>
  );
}
