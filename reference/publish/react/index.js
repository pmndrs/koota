"use strict";
import {
  $internal,
  $relationPair,
  createQuery,
  shallowEqual
} from "../dist/chunk-2PTGCURT.js";

// ../react/src/world/use-world.ts
import { useContext } from "react";

// ../react/src/world/world-context.ts
import { createContext } from "react";
var WorldContext = createContext(null);

// ../react/src/world/use-world.ts
function useWorld() {
  const world = useContext(WorldContext);
  if (!world) {
    throw new Error("Koota: useWorld must be used within a WorldProvider");
  }
  return world;
}

// ../react/src/hooks/use-actions.ts
function useActions(actions) {
  const world = useWorld();
  return actions(world);
}

// ../react/src/hooks/use-query.ts
import { useEffect, useMemo, useReducer, useRef } from "react";
function useQuery(...parameters) {
  const world = useWorld();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const queryRef = useMemo(() => createQuery(...parameters), parameters);
  const cacheRef = useRef(null);
  const getResult = () => {
    const query = world[$internal].queriesHashMap.get(queryRef.hash);
    if (query && cacheRef.current?.hash === queryRef.hash && cacheRef.current.version === query.version) {
      return cacheRef.current.result;
    }
    const result2 = world.query(queryRef).sort();
    const registeredQuery = world[$internal].queriesHashMap.get(queryRef.hash);
    cacheRef.current = {
      hash: queryRef.hash,
      version: registeredQuery.version,
      result: result2
    };
    return result2;
  };
  const result = getResult();
  useEffect(() => {
    const update = () => forceUpdate();
    let unsubAdd = () => {
    };
    let unsubRemove = () => {
    };
    const subscribe = () => {
      unsubAdd = world.onQueryAdd(queryRef, update);
      unsubRemove = world.onQueryRemove(queryRef, update);
      const query = world[$internal].queriesHashMap.get(queryRef.hash);
      if (cacheRef.current && query.version !== cacheRef.current.version) {
        update();
      }
    };
    const handleReset = () => {
      cacheRef.current = null;
      unsubAdd();
      unsubRemove();
      subscribe();
      update();
    };
    subscribe();
    world[$internal].resetSubscriptions.add(handleReset);
    return () => {
      world[$internal].resetSubscriptions.delete(handleReset);
      unsubAdd();
      unsubRemove();
    };
  }, [world, queryRef]);
  return result;
}

// ../react/src/hooks/use-query-first.ts
function useQueryFirst(...parameters) {
  const query = useQuery(...parameters);
  return query[0];
}

// ../react/src/hooks/use-tag.ts
import { useEffect as useEffect2, useMemo as useMemo2, useReducer as useReducer2, useRef as useRef2 } from "react";

// ../react/src/utils/is-world.ts
function isWorld(target) {
  return typeof target?.spawn === "function";
}

// ../react/src/hooks/use-tag.ts
function useTag(target, tag) {
  const contextWorld = useWorld();
  const [, forceUpdate] = useReducer2((x) => x + 1, 0);
  const memo = useMemo2(() => target ? createSubscriptions(target, tag, contextWorld) : void 0, [target, tag, contextWorld]);
  const valueRef = useRef2(false);
  const memoRef = useRef2(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(tag) ?? false;
  }
  useEffect2(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions(target, tag, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(tag, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(tag, (e) => {
        if (e === entity) setValue(false);
      });
      setValue(entity.has(tag));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-has.ts
import { useEffect as useEffect3, useMemo as useMemo4, useReducer as useReducer3, useRef as useRef3 } from "react";

// ../react/src/utils/use-stable-pair.ts
import { useMemo as useMemo3 } from "react";
function useStableTrait(input) {
  const relation = input?.[$relationPair] ? input.relation : input;
  const pairTarget = input?.[$relationPair] ? input.target : void 0;
  return useMemo3(() => input, [relation, pairTarget]);
}

// ../react/src/hooks/use-has.ts
function useHas(target, trait) {
  const contextWorld = useWorld();
  const [, forceUpdate] = useReducer3((x) => x + 1, 0);
  const stableTrait = useStableTrait(trait);
  const memo = useMemo4(() => target ? createSubscriptions2(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  const valueRef = useRef3(false);
  const memoRef = useRef3(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ?? false;
  }
  useEffect3(() => {
    if (!memo) {
      valueRef.current = false;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions2(target, trait, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  const isWildcard = !!trait?.[$relationPair] && trait.target === "*";
  const wildcardRelation = isWildcard ? trait.relation : void 0;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(trait, (e) => {
        if (e === entity) setValue(true);
      });
      const onRemoveUnsub = world.onRemove(trait, (e) => {
        if (e !== entity) return;
        if (wildcardRelation) {
          setValue(entity.targetsFor(wildcardRelation).length > 1);
        } else {
          setValue(false);
        }
      });
      setValue(entity.has(trait));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-target.ts
import { useEffect as useEffect4, useMemo as useMemo5, useReducer as useReducer4, useRef as useRef4 } from "react";
function useTarget(target, relation) {
  const contextWorld = useWorld();
  const [, forceUpdate] = useReducer4((x) => x + 1, 0);
  const memo = useMemo5(() => target ? createSubscriptions3(target, relation, contextWorld) : void 0, [target, relation, contextWorld]);
  const valueRef = useRef4(void 0);
  const memoRef = useRef4(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetFor(relation);
  }
  useEffect4(() => {
    if (!memo) {
      valueRef.current = void 0;
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions3(target, relation, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onAddUnsub = world.onAdd(relation, (e) => {
        if (e === entity) setValue(entity.targetFor(relation));
      });
      const onRemoveUnsub = world.onRemove(relation, (e) => {
        if (e === entity) setValue(void 0);
      });
      const onChangeUnsub = world.onChange(relation, (e) => {
        if (e === entity) setValue(entity.targetFor(relation));
      });
      setValue(entity.targetFor(relation));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-targets.ts
import { useEffect as useEffect5, useMemo as useMemo6, useReducer as useReducer5, useRef as useRef5 } from "react";
function useTargets(target, relation) {
  const contextWorld = useWorld();
  const [, forceUpdate] = useReducer5((x) => x + 1, 0);
  const memo = useMemo6(() => target ? createSubscriptions4(target, relation, contextWorld) : void 0, [target, relation, contextWorld]);
  const valueRef = useRef5([]);
  const memoRef = useRef5(memo);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.targetsFor(relation) ?? [];
  }
  useEffect5(() => {
    if (!memo) {
      valueRef.current = [];
      forceUpdate();
      return;
    }
    const unsubscribe = memo.subscribe((value) => {
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsubscribe();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions4(target, relation, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      let currentValue = [];
      const update = (value) => {
        currentValue = value;
        setValue(value);
      };
      const onAddUnsub = world.onAdd(relation, (e) => {
        if (e === entity) update(entity.targetsFor(relation));
      });
      const onRemoveUnsub = world.onRemove(relation, (e, t) => {
        if (e === entity) update(currentValue.filter((p) => p !== t));
      });
      const onChangeUnsub = world.onChange(relation, (e) => {
        if (e === entity) update(entity.targetsFor(relation));
      });
      update(entity.targetsFor(relation));
      return () => {
        onAddUnsub();
        onRemoveUnsub();
        onChangeUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait.ts
import { useEffect as useEffect6, useMemo as useMemo7, useReducer as useReducer6, useRef as useRef6 } from "react";
function useTrait(target, trait) {
  const contextWorld = useWorld();
  const [, forceUpdate] = useReducer6((x) => x + 1, 0);
  const valueRef = useRef6(void 0);
  const memoRef = useRef6(void 0);
  const stableTrait = useStableTrait(trait);
  const memo = useMemo7(() => target ? createSubscriptions5(target, stableTrait, contextWorld) : void 0, [target, stableTrait, contextWorld]);
  if (memoRef.current !== memo) {
    memoRef.current = memo;
    valueRef.current = memo?.entity.has(stableTrait) ? memo.entity.get(stableTrait) : void 0;
  }
  useEffect6(() => {
    if (!memo) return;
    let initialized = false;
    const unsub = memo.subscribe((value) => {
      if (!initialized) {
        initialized = true;
        if (shallowEqual(value, valueRef.current)) return;
      }
      valueRef.current = value;
      forceUpdate();
    });
    return () => unsub();
  }, [memo]);
  return valueRef.current;
}
function createSubscriptions5(target, trait, contextWorld) {
  const world = isWorld(target) ? target : contextWorld;
  const entity = isWorld(target) ? target[$internal].worldEntity : target;
  return {
    entity,
    subscribe: (setValue) => {
      const onChangeUnsub = world.onChange(trait, (e) => {
        if (e === entity) setValue(e.get(trait));
      });
      const onAddUnsub = world.onAdd(trait, (e) => {
        if (e === entity) setValue(e.get(trait));
      });
      const onRemoveUnsub = world.onRemove(trait, (e) => {
        if (e === entity) setValue(void 0);
      });
      setValue(entity.has(trait) ? entity.get(trait) : void 0);
      return () => {
        onChangeUnsub();
        onAddUnsub();
        onRemoveUnsub();
      };
    }
  };
}

// ../react/src/hooks/use-trait-effect.ts
import { useEffect as useEffect7, useMemo as useMemo8, useRef as useRef7 } from "react";
function useTraitEffect(target, trait, callback) {
  const contextWorld = useWorld();
  const world = useMemo8(() => isWorld(target) ? target : contextWorld, [target, contextWorld]);
  const entity = useMemo8(() => isWorld(target) ? target[$internal].worldEntity : target, [target]);
  const stableTrait = useStableTrait(trait);
  const callbackRef = useRef7(callback);
  callbackRef.current = callback;
  useEffect7(() => {
    const onChangeUnsub = world.onChange(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onAddUnsub = world.onAdd(stableTrait, (e) => {
      if (e === entity) callbackRef.current(e.get(stableTrait));
    });
    const onRemoveUnsub = world.onRemove(stableTrait, (e) => {
      if (e === entity) callbackRef.current(void 0);
    });
    callbackRef.current(entity.has(stableTrait) ? entity.get(stableTrait) : void 0);
    return () => {
      onChangeUnsub();
      onAddUnsub();
      onRemoveUnsub();
    };
  }, [stableTrait, world, entity]);
}

// ../react/src/world/world-provider.tsx
import { jsx } from "react/jsx-runtime";
function WorldProvider({
  children,
  world
}) {
  return /* @__PURE__ */ jsx(WorldContext.Provider, { value: world, children });
}
export {
  WorldProvider,
  useActions,
  useHas,
  useQuery,
  useQueryFirst,
  useTag,
  useTarget,
  useTargets,
  useTrait,
  useTraitEffect,
  useWorld
};
