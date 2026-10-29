import { expect, it, vi } from 'vitest';
import { createWorld, createChanged, Name, trait } from '../src';

// The flag is read once at module load, so set it before importing Koota.
vi.hoisted(() => {
  vi.stubGlobal('__KOOTA_ASSERTS__', false);
});

it('refuses a taken name without throwing when assertions are disabled', () => {
  const Health = trait({ value: 1 });
  const world = createWorld();
  const player = world.spawn(Name('player'));
  const other = world.spawn(Health, Name('player'));
  const hero = world.spawn(Name('hero'));
  const changed = vi.fn();
  const Changed = createChanged();
  world.onChange(Name, changed);
  world.query(Changed(Name));

  other.add(Name('player'));
  hero.set(Name, 'player');
  for (const changeDetection of ['auto', 'always', 'never'] as const) {
    world.query(Name('hero'), Name).updateEach(
      (state) => {
        state[0] = 'player';
      },
      { changeDetection }
    );
  }

  expect(world.lookup('player')).toBe(player);
  expect(other.has(Health)).toBe(true);
  expect(other.get(Health)?.value).toBe(1);
  expect(other.has(Name)).toBe(false);
  expect(hero.name()).toBe('hero');
  expect(changed).not.toHaveBeenCalled();
  expect(world.query(Changed(Name))).toHaveLength(0);
});
