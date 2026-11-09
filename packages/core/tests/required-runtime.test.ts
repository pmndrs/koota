import { afterAll, expect, it, vi } from 'vitest';
import { required, trait } from '../src';

vi.hoisted(() => {
  vi.stubGlobal('__KOOTA_ASSERTS__', false);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it('rejects the record of a required value with assertions disabled', () => {
  const MeshRef = trait(required<{ visible: boolean }>());
  // @ts-expect-error - a required trait value has no record
  expect(() => MeshRef.record()).toThrow('[NO_RECORD]');
});
