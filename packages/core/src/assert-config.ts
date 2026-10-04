declare const __KOOTA_ASSERTS__: boolean;
declare const process: { env: { NODE_ENV?: string } };

function defaultAssertsEnabled() {
  // Bundlers replace NODE_ENV. Direct browser imports keep assertions enabled.
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

export const assertsEnabled =
  typeof __KOOTA_ASSERTS__ !== 'undefined' ? __KOOTA_ASSERTS__ : defaultAssertsEnabled();
