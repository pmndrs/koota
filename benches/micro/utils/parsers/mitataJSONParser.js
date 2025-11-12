import { $ as mitataUtils } from 'mitata';

const mitataJSONParser = (json) => {
    const { layout, benchmarks, context } = json;

    const structuredOutput = {
        context: {},
        groups: [],
        footer: { warnings: [] },
        layoutInfo: {},
    };

    structuredOutput.context = {
        clockSpeedGHz: `${context.cpu.freq.toFixed(2)} GHz`,
        cpuName: context.cpu.name || 'N/A',
        runtime: `${context.runtime}${!context.version ? '' : ` ${context.version}`}`,
        arch: context.arch || 'N/A',
    };

    let k_legend = 28;
    benchmarks.forEach(trial => {
        trial.runs.forEach(run => k_legend = Math.max(k_legend, run.name.length));
        if (trial.alias) k_legend = Math.max(k_legend, trial.alias.length);
    });
    k_legend = Math.max(20, k_legend);
    structuredOutput.layoutInfo = {
        maxNameLength: k_legend
    };
    let optimizedOutWarning = false;
    
    layout.forEach((groupInfo, groupIdx) => {
        const groupBenchmarks = benchmarks.filter(b => b.group === groupIdx);
        if (groupBenchmarks.length === 0) return;

        const currentGroup = {
            id: groupIdx,
            name: groupInfo.name || null,
            types: groupInfo.types || [],
            runs: [],
            plots: {}
        };

        const groupPlotData = {};

        groupBenchmarks.forEach(trial => {
            const highlightColor = trial.style.highlight || null;
            const isCompact = trial.style.compact;
            trial.runs.forEach(run => {
                const runResult = {
                    name: run.name,
                    highlightColor: highlightColor,
                    isCompact: isCompact,
                    error: null,
                    stats: null,
                    isOptimizedOut: false,
                };

                if (run.error) {
                    runResult.error = run.error.message || run.error;
                } else {
                    const stats = run.stats;
                    runResult.isOptimizedOut = stats.avg < (1.42 * noopTime);
                    if (runResult.isOptimizedOut) optimizedOutWarning = true;
                    runResult.stats = {
                        avg: mitataUtils.time(stats.avg),
                        min: mitataUtils.time(stats.min),
                        max: mitataUtils.time(stats.max),
                        p75: mitataUtils.time(stats.p75),
                        p99: mitataUtils.time(stats.p99),
                        gc: (stats.gc && stats.gc.min !== Infinity)
                            ? {
                                  min: mitataUtils.time(stats.gc.min),
                                  max: mitataUtils.time(stats.gc.max),
                                  avg: mitataUtils.time(stats.gc.avg),
                              }
                            : null,
                        heap: (stats.heap && stats.heap.min !== Infinity)
                            ? {
                                  min: mitataUtils.bytes(stats.heap.min),
                                  max: mitataUtils.bytes(stats.heap.max),
                                  avg: mitataUtils.bytes(stats.heap.avg),
                              }
                            : null,
                    };
                    if (currentGroup.types.includes('b')) {
                        if (!groupPlotData.barplot) {
                            groupPlotData.barplot = { type: 'b', data: {}, colors: {} };
                        }
                        groupPlotData.barplot.data[run.name] = stats.avg;
                        groupPlotData.barplot.colors[run.name] = highlightColor;
                    }
                }
                currentGroup.runs.push(runResult);
            });
        });


        if (groupPlotData.barplot) {
            const barPlotLines = mitataUtils.barplot.ascii(
                groupPlotData.barplot.data,
                k_legend,
                groupPlotData.barplot.config?.barSize || 44,
                {
                    steps: groupPlotData.barplot.config?.steps || -10,
                    colors: groupPlotData.barplot.colors,
                    fmt: mitataUtils.time
                }
            );
            currentGroup.plots.barplot = {
                rawData: groupPlotData.barplot.data,
                rawColors: groupPlotData.barplot.colors,
            };
        }
        structuredOutput.groups.push(currentGroup);
    });
    if (optimizedOutWarning) {
        structuredOutput.footer.warnings.push({
            type: 'optimizedOut',
            link: 'https://github.com/evanwashere/mitata#writing-good-benchmarks'
        });
    }

    return structuredOutput;
}

export default mitataJSONParser;