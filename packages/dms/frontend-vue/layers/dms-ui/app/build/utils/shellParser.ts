import type { StreamParser, StringStream } from "@codemirror/language";

// A shell snippet as read for highlighting only: the command of each
// pipeline step, its flags, quoted strings, variables and comments.

interface ShellState {
  /** The next word is a command: at a line start, after `|`, `&&` or `;`. */
  isAtCommand: boolean;
  /** The line ends with `\`: the next one carries on the same command. */
  isContinued: boolean;
}

const COMMENT = /^#.*/;
const VARIABLE = /^\$(?:\{[^}]*\}|\w+|[?!#$@*-])/;
const STRING = /^(?:"(?:[^"\\]|\\.)*"?|'[^']*'?)/;
const FLAG = /^--?[\w-]+/;
const SEPARATOR = /^(?:\|\|?|&&?|;)/;
const WORD = /^[^\s|&;"'$]+/;
const CONTINUATION = /^\\$/;

function readToken(stream: StringStream, state: ShellState): string | null {
  if (stream.match(COMMENT)) return "comment";
  if (stream.match(STRING)) return "string";
  if (stream.match(VARIABLE)) return "variableName.special";
  if (stream.match(SEPARATOR)) {
    state.isAtCommand = true;
    return "operator";
  }
  if (stream.match(FLAG)) return "attributeName";
  if (stream.match(CONTINUATION)) {
    state.isContinued = true;
    return null;
  }
  if (!stream.match(WORD)) {
    stream.next();
    return null;
  }
  const isCommand = state.isAtCommand;
  state.isAtCommand = false;
  return isCommand ? "keyword" : null;
}

export const shellParser: StreamParser<ShellState> = {
  name: "shell",
  startState: () => ({ isAtCommand: true, isContinued: false }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      state.isAtCommand = !state.isContinued;
      state.isContinued = false;
    }
    if (stream.eatSpace()) return null;
    return readToken(stream, state);
  },
};
