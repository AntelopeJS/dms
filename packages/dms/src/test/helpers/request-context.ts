import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";

const DEFAULT_URL = "http://localhost/";

/**
 * A request context over a real, unconnected request and response, with no
 * headers unless an `Authorization` value is given.
 */
export function requestContextFixture(
  url: URL = new URL(DEFAULT_URL),
  authorization?: string,
): RequestContext {
  const rawRequest = new IncomingMessage(new Socket());
  if (authorization !== undefined) {
    rawRequest.headers.authorization = authorization;
  }
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url,
    routeParameters: {},
    response: new HTTPResult(),
  };
}

/** A request context that throws on any read, for code that must never touch it. */
export function untouchedRequestContext(): RequestContext {
  return new Proxy(requestContextFixture(), {
    get: () => {
      throw new Error("The code read the request context");
    },
  });
}
