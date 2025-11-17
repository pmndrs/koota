const kootaBenchPrefix = "___KOOTA_BENCH___";
const start = `${kootaBenchPrefix} __Start__`;
const end = `${kootaBenchPrefix} __End__`;

export const labelDelimiters = {
  // wraps the entire bench
  microbench: "MicroBench",
  // static steps
  setup: 'Setup Bench',
  firstBench: 'First Bench',
  postBench: 'Post Bench'
}

export const blockParseDelimiters = {
  // utils
  runKey: 'RunKey',
  debugPrint: 'DebugPrint',
  runOptStatus: 'RunOptStatus',
  // between first and post 
  // where a deopt and most other things would happen
  runBench: 'Run Bench',
}

export const logs = {
  ...labelDelimiters,
  ...blockParseDelimiters
};

const logPairs = Object.fromEntries(
  Object.entries(logs).map(([key, string]) => {
    const delimiter = [
      key,
      {
        start: `${start} ${string}`,
        end: `${end} ${string}`,
      }
    ];
    return delimiter;
  })
);

const logDelimiters = {
    ...logPairs,
    start,
    end
}

export default logDelimiters