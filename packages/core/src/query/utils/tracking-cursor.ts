// Ids 0 to 2 belong to the has, not and or modifiers, which track nothing.
let cursor = 3;

/**
 * Each tracking modifier instance gets its own id so queries built from it hash apart and keep
 * their own batch. The id carries no world state, a tracking query starts observing when it is
 * created and reads the current masks for what happened before.
 */
export function createTrackingId() {
  return cursor++;
}
