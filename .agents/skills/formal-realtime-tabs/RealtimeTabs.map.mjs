/**
 * Reader's view of RealtimeTabs.tla for /statechart: one region per tab (what
 * it shows of the record, and whether it follows the page), one for the
 * record and the shared stream.
 */

/**
 * @typedef {"t1" | "t2"} TabId
 * @typedef {{ st: string, sid: number, conn: number, topics: boolean, loaded: boolean, shown: number }} TabState
 * @typedef {{ alive: boolean, page: boolean }} SessionState
 * @typedef {{ k: string }} Message
 * @typedef {{
 *   tab: Record<TabId, TabState>;
 *   sess: Record<number, SessionState>;
 *   lead: { tab: TabId, h: number };
 *   conn: Record<number, { open: boolean, q: Record<number, Message> }>;
 *   chan: Record<TabId, Record<number, Message>>;
 *   stored: number;
 * }} State
 * @typedef {Record<string, string>} Names
 */

/** @type {TabId[]} */
const TAB_IDS = ["t1", "t2"];

/** @type {Record<TabId, string>} */
const TAB_NAMES = { t1: "Tab 1", t2: "Tab 2" };

/**
 * A TLA+ sequence arrives as an object keyed from 1.
 * @param {Record<number, unknown>} seq
 */
const length = (seq) => Object.keys(seq).length;

/**
 * @param {State} v
 * @param {TabId} t
 */
function session(v, t) {
  const r = v.tab[t];
  if (r.st === "unopened") return "not open";
  if (r.st === "closed") return "closed";
  const s = r.sid === 0 ? undefined : v.sess[r.sid];
  if (!s) return r.conn === 0 ? "waits for the stream" : "opens its session";
  if (!s.alive) return "holds a session the server ended";
  if (!s.page) return "has a session, not yet on the page";
  return r.topics ? "follows the page" : "is on the page, its topics not yet read";
}

/** @param {TabState} r */
function screen(r) {
  if (r.st !== "open") return "";
  return r.loaded ? `, shows v${r.shown}` : ", shows nothing yet";
}

/** @param {State} v */
function record(v) {
  const stream = v.lead.h !== 0 && v.conn[v.lead.h].open ? "stream up" : "stream down";
  return `v${v.stored} stored, ${stream}`;
}

/** One region per tab, and one for the record with the stream. */
/** @param {State} v */
export function state(v) {
  return {
    "Tab 1": `${session(v, "t1")}${screen(v.tab.t1)}`,
    "Tab 2": `${session(v, "t2")}${screen(v.tab.t2)}`,
    Record: record(v),
  };
}

/**
 * @param {State} from
 * @param {State} to
 */
function changedTab(from, to) {
  return TAB_IDS.find((t) => JSON.stringify(from.tab[t]) !== JSON.stringify(to.tab[t]));
}

/** @param {State} v */
function leaderName(v) {
  return TAB_NAMES[v.lead.tab] ?? "the leader";
}

/** @type {Record<string, (who: string, from: State, to: State, t: TabId | undefined) => string>} */
const STEPS = {
  Write: () => "someone saves the record",
  OpenTab: () => "you open the page in tab 2",
  CloseTab: (who) => `you close ${who.toLowerCase()}`,
  StreamDrops: () => "the stream drops",
  TakeLead: (who) => `${who} takes the shared stream and opens it`,
  LeaderReads: (_who, from) =>
    from.conn[from.lead.h].q[1].k === "hello"
      ? `${leaderName(from)} learns the stream's connection`
      : `${leaderName(from)} reads a frame of the record`,
  LeaderSeesDrop: (_who, from) => `${leaderName(from)} sees the stream end`,
  LeaderReconnects: (_who, from) => `${leaderName(from)} reopens the stream`,
  TabReceives: (who, from, _to, t) => {
    if (t === undefined) throw new TypeError("TabReceives has an acting tab");
    const m = from.chan[t][1];
    if (m.k === "conn") return `${who} hears the connection`;
    if (m.k === "frame") return `${who} hears a relayed frame`;
    if (m.k === "query") return `${who} hears the other tab ask for the connection`;
    return `${who} hears a reopen request`;
  },
  SessionServed: (who) => `the server opens ${who.toLowerCase()}'s session`,
  SessionAnswered: (who) => `${who} reads its session answer`,
  TimerFires: (who) => `${who}'s retry timer fires`,
  StartReconcile: (who) => `${who} asks to follow the page`,
  SubscribeServed: (who) => `the server subscribes ${who.toLowerCase()}'s session to the page`,
  SubscribeAnswered: (who) => `${who} reads the page's topics`,
  BurstFires: (who) => `${who} refreshes the page's data`,
  RunReads: (who) => `${who}'s data read reaches the database`,
  RunAnswers: (who) => `${who}'s data read answers`,
  GetReads: (who) => `${who}'s row read reaches the database`,
  GetAnswers: (who) => `${who}'s row read answers`,
  Done: () => "nothing more happens",
};

/**
 * @param {string} action
 * @param {State} from
 * @param {State} to
 */
function actor(action, from, to) {
  if (action === "Done") return undefined;
  if (action === "TakeLead") return to.lead.tab;
  if (action === "CloseTab") return TAB_IDS.find((t) => to.tab[t].st !== from.tab[t].st);
  if (action.startsWith("Leader")) return from.lead.tab;
  if (action === "TabReceives")
    return TAB_IDS.find((t) => length(from.chan[t]) > length(to.chan[t]));
  return changedTab(from, to);
}

/** The arrow label, as the person at the browser sees it happen. */
/**
 * @param {string} action
 * @param {State} from
 * @param {State} to
 */
export function step(action, from, to) {
  const label = STEPS[action];
  if (!label) return action;
  const t = actor(action, from, to);
  return label((t && TAB_NAMES[t]) ?? "a tab", from, to, t);
}

/** @param {State} v */
export function group(v) {
  const open = TAB_IDS.filter((t) => v.tab[t].st === "open");
  return open.every((t) => v.tab[t].loaded && v.tab[t].shown === v.stored) ? "current" : "behind";
}

export const colors = { current: "teal", behind: "orange" };

export const title = "A saved record reaching the tabs of one browser";
