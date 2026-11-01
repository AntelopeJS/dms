/**
 * Reader's view of RealtimeTabs.tla for /statechart: one region per tab (what
 * it shows of the record, and whether it follows the page), one for the
 * record and the shared stream.
 */

const TAB_NAMES = { t1: "Tab 1", t2: "Tab 2" };

/** A TLA+ sequence arrives as an object keyed from 1. */
const length = (seq) => Object.keys(seq).length;

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

function screen(r) {
  if (r.st !== "open") return "";
  return r.loaded ? `, shows v${r.shown}` : ", shows nothing yet";
}

function record(v) {
  const stream = v.lead.h !== 0 && v.conn[v.lead.h].open ? "stream up" : "stream down";
  return `v${v.stored} stored, ${stream}`;
}

/** One region per tab, and one for the record with the stream. */
export function state(v) {
  return {
    "Tab 1": `${session(v, "t1")}${screen(v.tab.t1)}`,
    "Tab 2": `${session(v, "t2")}${screen(v.tab.t2)}`,
    Record: record(v),
  };
}

function changedTab(from, to) {
  return ["t1", "t2"].find((t) => JSON.stringify(from.tab[t]) !== JSON.stringify(to.tab[t]));
}

function leaderName(v) {
  return TAB_NAMES[v.lead.tab] ?? "the leader";
}

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

function actor(action, from, to) {
  if (action === "Done") return undefined;
  if (action === "TakeLead") return to.lead.tab;
  if (action === "CloseTab") return ["t1", "t2"].find((t) => to.tab[t].st !== from.tab[t].st);
  if (action.startsWith("Leader")) return from.lead.tab;
  if (action === "TabReceives")
    return ["t1", "t2"].find((t) => length(from.chan[t]) > length(to.chan[t]));
  return changedTab(from, to);
}

/** The arrow label, as the person at the browser sees it happen. */
export function step(action, from, to) {
  const label = STEPS[action];
  if (!label) return action;
  const t = actor(action, from, to);
  return label(TAB_NAMES[t] ?? "a tab", from, to, t);
}

export function group(v) {
  const open = ["t1", "t2"].filter((t) => v.tab[t].st === "open");
  return open.every((t) => v.tab[t].loaded && v.tab[t].shown === v.stored) ? "current" : "behind";
}

export const colors = { current: "teal", behind: "orange" };

export const title = "A saved record reaching the tabs of one browser";
