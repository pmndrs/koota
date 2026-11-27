import { $internal } from '../internal';
import { createTraitDefinition, pairTraitAccessors } from '../trait/trait';
import type { TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import type { Identifier, IdentifierKey, IdentifierOptions, IdentifierPair } from './types';

export function identifier<K extends IdentifierKey = string>(
  options?: IdentifierOptions
): Identifier<K> {
  const scope = options?.scope;
  if (scope !== undefined && !scope[$internal].exclusive) {
    throw new Error('Koota: [IDENTIFIER_SCOPE] A scoping relation must be exclusive.');
  }
  const backing = createTraitDefinition({}, 'identifier', pairTraitAccessors);
  const Identifier = Object.assign(
    (target: K): IdentifierPair<K> => {
      if (typeof target !== 'string' && (typeof target !== 'number' || !Number.isFinite(target))) {
        throw new Error('Koota: Identifier keys must be strings or finite numbers.');
      }
      return { [$identifierPair]: true, identifier: Identifier, target };
    },
    {
      [$internal]: {
        trait: backing,
        sharedMask: backing[$internal].sharedMask,
        exclusive: options?.exclusive ?? true,
        scope,
      },
    }
  ) as Identifier<K>;
  Object.defineProperties(Identifier, {
    [$identifier]: { value: true },
    id: { value: backing.id, enumerable: true },
  });
  backing[$internal].identifier = Identifier;
  backing[$internal].onRegister = registerIdentifier;
  if (scope !== undefined) (scope[$internal].scopedIdentifiers ??= []).push(Identifier);
  return Identifier;
}

export /* @inline @pure */ function isIdentifier(value: unknown): value is Identifier {
  return !!(value as Identifier | null | undefined)?.[$identifier];
}

export /* @inline @pure */ function isIdentifierPair(value: unknown): value is IdentifierPair {
  return !!(value as IdentifierPair | null | undefined)?.[$identifierPair];
}

function registerIdentifier(_ctx: WorldContext, instance: TraitInstance) {
  const scoped = instance.trait[$internal].identifier![$internal].scope !== undefined;
  instance.identifier = {
    targets: [],
    owners: new Map(),
    scopes: scoped ? new Map() : undefined,
    scopeTargets: scoped ? [] : undefined,
    scopeOwners: scoped ? [] : undefined,
    positions: undefined,
    queries: new Map(),
  };
}

export const $identifier = Symbol('identifier');
export const $identifierPair = Symbol('identifierPair');
