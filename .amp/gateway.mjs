import http from "node:http";

const listenPort = Number(process.env.PORT);
const publicUrl = new URL(process.env.PUBLIC_URL);
const frontendUrl = new URL("http://127.0.0.1:3001");
const backendUrl = new URL("http://127.0.0.1:5010");
const backendPrefix = "/__dms_api";

if (!Number.isInteger(listenPort)) {
  throw new Error("PORT must be an integer");
}

function selectTarget(requestUrl = "/") {
  const parsedUrl = new URL(requestUrl, "http://gateway.internal");
  const path = `${parsedUrl.pathname}${parsedUrl.search}`;
  const isBackend =
    path === backendPrefix || path.startsWith(`${backendPrefix}/`);

  return {
    target: isBackend ? backendUrl : frontendUrl,
    path: isBackend ? path.slice(backendPrefix.length) || "/" : path,
  };
}

function upstreamHeaders(request, target, upgrade = false) {
  const headers = { ...request.headers, host: target.host };

  if (upgrade) {
    headers.connection = "Upgrade";
    headers.upgrade = request.headers.upgrade;
  }

  return headers;
}

function responseHeaders(headers, target) {
  const forwarded = { ...headers };
  const location = forwarded.location;

  if (typeof location === "string" && location.startsWith(target.origin)) {
    forwarded.location = `${publicUrl.origin}${location.slice(target.origin.length)}`;
  }

  return forwarded;
}

const server = http.createServer((request, response) => {
  if (request.url === "/__gateway_health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
    return;
  }

  const { target, path } = selectTarget(request.url);
  const upstream = http.request(
    new URL(path, target),
    {
      method: request.method,
      headers: upstreamHeaders(request, target),
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        responseHeaders(upstreamResponse.headers, target),
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain" });
    }
    response.end(`Gateway upstream error: ${error.message}\n`);
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
});

server.on("upgrade", (request, socket, head) => {
  const { target, path } = selectTarget(request.url);
  const upstream = http.request(new URL(path, target), {
    method: request.method,
    headers: upstreamHeaders(request, target, true),
  });

  upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    const statusLine = `HTTP/1.1 ${upstreamResponse.statusCode ?? 101} ${upstreamResponse.statusMessage ?? "Switching Protocols"}`;
    const headers = [];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      headers.push(
        `${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1]}`,
      );
    }

    socket.write(`${statusLine}\r\n${headers.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstreamSocket.write(head);
    if (upstreamHead.length > 0) socket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
    upstreamSocket.on("error", () => socket.destroy());
    socket.on("error", () => upstreamSocket.destroy());
  });

  upstream.on("response", (upstreamResponse) => {
    socket.end(
      `HTTP/1.1 ${upstreamResponse.statusCode ?? 502} ${upstreamResponse.statusMessage ?? "Bad Gateway"}\r\nConnection: close\r\n\r\n`,
    );
    upstreamResponse.destroy();
  });
  upstream.on("error", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.end();
});

server.listen(listenPort, "0.0.0.0");
