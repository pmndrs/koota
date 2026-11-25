export * from '../../core/src/isolated';

// Every entity in a program that imports this entry is a bare id in its type, as it is at
// runtime in a world created here.
declare module 'koota' {
  interface Register {
    entityMethods: false;
  }
}
