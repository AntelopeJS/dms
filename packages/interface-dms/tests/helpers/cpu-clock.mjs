/**
 * Starts a clock of the CPU time this process spends, user and system. A
 * loaded host deschedules the process, which inflates wall time but not CPU
 * time, so a time bound read from this clock fails only on slow code.
 *
 * @returns {() => number} the CPU milliseconds spent since the clock started
 */
export const startCpuClock = () => {
  const started = process.cpuUsage();
  return () => {
    const { user, system } = process.cpuUsage(started);
    return (user + system) / 1000;
  };
};
