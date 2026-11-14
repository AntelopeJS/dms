const { IncomingMessage, ServerResponse } = require("node:http");
const { Socket } = require("node:net");
const { HTTPResult } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");

/**
 * A request context for a probe that calls a parameter provider or a route
 * directly: an unconnected request carrying `headers`, its response, and an
 * empty URL and route.
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @returns {import("../../packages/interface-dms/node_modules/@antelopejs/interface-api").RequestContext}
 */
function requestContext(headers) {
  const rawRequest = new IncomingMessage(new Socket());
  rawRequest.headers = headers;
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://probe/"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

module.exports = { requestContext };
