declare const __KOOTA_ASSERTS__: boolean;
declare const __KOOTA_WARNINGS__: boolean;
declare const process: { env: { NODE_ENV?: string } };

function getDevelopmentDefault() {
  // Bundlers replace NODE_ENV. Direct browser imports enable development checks.
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

export const assertsEnabled =
  typeof __KOOTA_ASSERTS__ !== 'undefined' ? __KOOTA_ASSERTS__ : getDevelopmentDefault();
export const warningsEnabled =
  typeof __KOOTA_WARNINGS__ !== 'undefined' ? __KOOTA_WARNINGS__ : getDevelopmentDefault();
