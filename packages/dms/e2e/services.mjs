import { apiTargetFile, serveForwarder } from "./forwarder.mjs";
import { setUpFrontendWorkspace } from "./frontend-workspace.mjs";
import { serveMail } from "./mail.mjs";
import { loadRun } from "./run-state.mjs";

/**
 * @typedef {"mail" | "api" | "prepare-frontend"} ServiceName A process a run starts from the kit's service entry
 */

/**
 * What each service runs, given the arguments after its name: `mail <run>`
 * serves the run's mail sink and `api <run>` its API forwarder, both until
 * the process is stopped; `prepare-frontend <dms-frontend> <workspace>
 * <environment> install|sources` sets up a frontend workspace and returns.
 *
 * @type {Readonly<Record<ServiceName, (args: string[]) => Promise<unknown>>>}
 */
const SERVICES = {
  mail: ([dir = ""]) => {
    const state = loadRun(dir);
    return serveMail(state.mail, state.smtpPort);
  },
  api: ([dir = ""]) => {
    const state = loadRun(dir);
    return serveForwarder(state.apiPort, apiTargetFile(state.dir));
  },
  "prepare-frontend": ([
    frontend = "",
    workspace = "",
    environment = "",
    install,
  ]) =>
    setUpFrontendWorkspace(
      frontend,
      workspace,
      environment,
      install === "install",
    ),
};

/**
 * @param {string} name A service name
 * @returns {name is ServiceName} True for a service the entry runs
 */
function isServiceName(name) {
  return Object.hasOwn(SERVICES, name);
}

/**
 * Runs a service of a run in this process.
 *
 * @param {string} name The service
 * @param {string[]} args Its arguments
 * @returns {Promise<void>} Resolves once a server listens, which keeps the process alive, or once the setup is done
 * @throws When `name` is no service, or the service fails to start
 */
export async function runService(name, args) {
  if (!isServiceName(name)) {
    throw new Error(
      `Unknown service ${name}; expected one of ${Object.keys(SERVICES).join(", ")}`,
    );
  }
  await SERVICES[name](args);
}
