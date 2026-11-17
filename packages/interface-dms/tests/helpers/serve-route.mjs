import {
  getRegisteredRouteHandlers,
  HTTPResult,
} from "@antelopejs/interface-api";

/**
 * @param {import("@antelopejs/interface-api").ComputedParameter | null | undefined} parameter
 * @param {object} controller
 * @param {object} context
 */
async function resolve(parameter, controller, context) {
  if (!parameter?.provider) return undefined;
  /** @type {unknown} */
  let value = await parameter.provider.call(controller, context);
  for (const modifier of parameter.modifiers) {
    value = await modifier.call(controller, context, value);
  }
  return value;
}

/**
 * The registered route at `location`, served the way the API module serves it:
 * the controller properties resolved together (string keys, then symbols),
 * then the handler parameters resolved together, then the handler.
 *
 * @param {string} location
 * @param {string | undefined} authorization
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export async function serveRoute(location, authorization) {
  const route = getRegisteredRouteHandlers().find(
    ({ handler }) => handler.location === location,
  );
  if (!route) throw new Error(`No route registered at ${location}`);
  const { handler } = route;
  const context = {
    rawRequest: { headers: { authorization } },
    url: new URL(location, "http://localhost"),
  };
  try {
    const controller = new handler.controller();
    const { properties } = handler;
    const keys = [
      ...Object.keys(properties),
      ...Object.getOwnPropertySymbols(properties),
    ];
    const values = await Promise.all(
      keys.map((key) => resolve(properties[key], controller, context)),
    );
    keys.forEach((key, index) =>
      Object.assign(controller, { [key]: values[index] }),
    );
    const parameters = await Promise.all(
      handler.parameters.map((parameter) =>
        resolve(parameter, controller, context),
      ),
    );
    /** @type {unknown} */
    const body = await handler.callback.apply(controller, parameters);
    return { status: 200, body };
  } catch (error) {
    if (error instanceof HTTPResult) {
      return { status: error.getStatus(), body: error.getBody() };
    }
    throw error;
  }
}
