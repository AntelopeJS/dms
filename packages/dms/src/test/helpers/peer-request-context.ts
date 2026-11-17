import {
  type IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { Socket } from "node:net";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";

class PeerSocket extends Socket {
  override readonly remoteAddress: string;

  constructor(peerAddress: string) {
    super();
    this.remoteAddress = peerAddress;
  }
}

/**
 * A request context over a real, unconnected request whose socket reports
 * `peerAddress` as its peer, carrying `headers`.
 */
export function peerRequestContext(
  peerAddress: string,
  headers: IncomingHttpHeaders = {},
): RequestContext {
  const rawRequest = new IncomingMessage(new PeerSocket(peerAddress));
  rawRequest.headers = headers;
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://localhost/"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}
