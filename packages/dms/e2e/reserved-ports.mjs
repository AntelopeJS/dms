/**
 * The ports a run holds or has reserved: its API, dashboard and mail ports
 * and the port of every process it recorded.
 *
 * @param {{ apiPort?: number, webPort?: number, smtpPort?: number, processes?: ReadonlyArray<{ port?: number }> }} run The run, or the folders of one
 * @returns {number[]} The ports a new server must not take
 */
export function reservedPorts(run) {
  return [
    run.apiPort,
    run.webPort,
    run.smtpPort,
    ...(run.processes ?? []).map((entry) => entry.port),
  ].filter((port) => port !== undefined);
}
