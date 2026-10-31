import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

/**
 * @typedef {{ from: string, to: string[] }} Envelope
 * @typedef {{ buffer: string, inData: boolean, envelope: Envelope }} SmtpSession
 */

const END_OF_DATA = "\r\n.\r\n";
const QUOTED_SOFT_BREAK = /=\r?\n/g;
const QUOTED_BYTE = /=([0-9A-F]{2})/g;
const HEX = 16;

/**
 * @param {import("node:net").Socket} socket
 * @param {string} line
 */
function reply(socket, line) {
  socket.write(`${line}\r\n`);
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeQuotedPrintable(text) {
  return text
    .replace(QUOTED_SOFT_BREAK, "")
    .replace(QUOTED_BYTE, (_match, /** @type {string} */ byte) =>
      String.fromCharCode(Number.parseInt(byte, HEX)),
    );
}

/**
 * @param {string} message
 * @param {string} name
 * @returns {string}
 */
function headerOf(message, name) {
  const match = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im").exec(
    message,
  );
  return match ? match[1].replace(/\r?\n[ \t]+/g, " ").trim() : "";
}

/** @type {Record<string, string>} */
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/**
 * @param {string} html
 * @returns {string}
 */
function readableText(html) {
  const body = html.slice(html.search(/\r?\n\r?\n/));
  return body
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} folder
 * @param {Envelope} envelope
 * @param {string} raw
 */
function saveMessage(folder, envelope, raw) {
  mkdirSync(folder, { recursive: true });
  const index =
    readdirSync(folder).filter((name) => name.endsWith(".eml")).length + 1;
  const base = String(index).padStart(3, "0");
  const decoded = Buffer.from(decodeQuotedPrintable(raw), "latin1").toString(
    "utf8",
  );
  const links =
    decoded.replaceAll("&amp;", "&").match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const summary = {
    from: envelope.from,
    to: envelope.to,
    subject: headerOf(raw, "Subject"),
    links: [...new Set(links)],
    text: readableText(decoded),
    receivedAt: new Date().toISOString(),
  };
  writeFileSync(join(folder, `${base}.eml`), raw);
  writeFileSync(
    join(folder, `${base}.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

/**
 * @param {SmtpSession} state
 * @param {import("node:net").Socket} socket
 * @param {string} line
 */
function command(state, socket, line) {
  const verb = line.slice(0, 4).toUpperCase();
  if (verb === "EHLO" || verb === "HELO")
    return reply(socket, "250 dms-control");
  if (verb === "MAIL") {
    state.envelope = { from: line.slice(line.indexOf(":") + 1).trim(), to: [] };
    return reply(socket, "250 OK");
  }
  if (verb === "RCPT") {
    state.envelope.to.push(line.slice(line.indexOf(":") + 1).trim());
    return reply(socket, "250 OK");
  }
  if (verb === "DATA") {
    state.inData = true;
    return reply(socket, "354 End data with <CR><LF>.<CR><LF>");
  }
  if (verb === "QUIT") {
    reply(socket, "221 Bye");
    return socket.end();
  }
  return reply(socket, "250 OK");
}

/** @param {string} folder */
function session(folder) {
  return (/** @type {import("node:net").Socket} */ socket) => {
    /** @type {SmtpSession} */
    const state = { buffer: "", inData: false, envelope: { from: "", to: [] } };
    reply(socket, "220 dms-control mail sink");
    socket.on("data", (/** @type {Buffer} */ chunk) => {
      state.buffer += chunk.toString("latin1");
      while (state.buffer.length > 0) {
        if (state.inData) {
          const end = state.buffer.indexOf(END_OF_DATA);
          if (end === -1) return;
          saveMessage(
            folder,
            state.envelope,
            state.buffer.slice(0, end).replace(/^\.\./gm, "."),
          );
          state.buffer = state.buffer.slice(end + END_OF_DATA.length);
          state.inData = false;
          reply(socket, "250 OK: queued");
          continue;
        }
        const end = state.buffer.indexOf("\r\n");
        if (end === -1) return;
        const line = state.buffer.slice(0, end);
        state.buffer = state.buffer.slice(end + 2);
        command(state, socket, line);
      }
    });
    socket.on("error", () => socket.destroy());
  };
}

/**
 * Serves a plain SMTP sink on `port` that writes each message it receives
 * to `<folder>/NNN.eml`, with its envelope, subject, links and readable
 * text in `NNN.json`. It never relays anything.
 *
 * @param {string} folder Where the messages go
 * @param {number} port The loopback port to listen on
 * @returns {Promise<void>} Resolves once listening
 */
export function serveMail(folder, port) {
  mkdirSync(folder, { recursive: true });
  const server = createServer(session(folder));
  return new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

/**
 * The messages the sink captured so far, oldest first.
 *
 * @param {string} folder The sink's folder
 * @returns {{ file: string, from: string, to: string[], subject: string, links: string[], text: string, receivedAt: string }[]} The captured messages
 */
export function capturedMail(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      file: join(folder, name.replace(/\.json$/, ".eml")),
      ...JSON.parse(readFileSync(join(folder, name), "utf8")),
    }));
}
