declare const __KOOTA_WARNINGS__: boolean;
declare const process: { env: { NODE_ENV?: string } };

function defaultWarningsEnabled() {
  // Bundlers replace NODE_ENV. Direct browser imports keep warnings enabled.
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

export const warningsEnabled =
  typeof __KOOTA_WARNINGS__ !== 'undefined' ? __KOOTA_WARNINGS__ : defaultWarningsEnabled();
