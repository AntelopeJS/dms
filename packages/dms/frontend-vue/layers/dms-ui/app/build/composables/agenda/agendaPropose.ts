import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import type {
  AgendaEventData,
  AgendaProposal,
  AgendaPropose,
} from "../../../types/full-agenda";
import type { AgendaQuery } from "./agendaData";
import type { AgendaDayKey, AgendaPlacement } from "./agendaModel";
import { zonedDayKey } from "./agendaTime";

/** What a proposal prefills in the form of the new event besides its placement. */
export interface AgendaPrefill {
  calendarId?: string;
  title?: string;
  data?: AgendaEventData;
}

/** The query of the read: the URL key's value and the agenda's zone. */
export function proposalQuery(
  value: string,
  param: string,
  timeZone: string,
): AgendaQuery {
  return { [param]: value, tz: timeZone };
}

/** The proposal as a timed placement; `null` when its instants do not read or do not run forward. */
export function proposalPlacement(
  proposal: AgendaProposal,
): AgendaPlacement | null {
  const start = Date.parse(proposal.start);
  const end = Date.parse(proposal.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return {
    start,
    end,
    allDay: false,
    resourceIds: [...(proposal.resourceIds ?? [])],
  };
}

/** What the booking mode does around the agenda. */
export interface AgendaProposeDeps {
  propose: AgendaPropose;
  timeZone: string;
  read: (url: string, query: Record<string, string>) => Promise<AgendaProposal>;
  goTo: (day: AgendaDayKey) => void;
  open: (placement: AgendaPlacement, prefill: AgendaPrefill) => void;
  toast: (message: BlockText, tone: "info" | "error") => void;
  failedMessage: BlockText;
}

/**
 * Reads the proposal for `value` and opens the form of a new event on it, on
 * its day. A read that fails, or a proposal that does not read, tells so in
 * a toast and leaves the agenda as it is. Resolves whether the form opened.
 */
export async function bookProposal(
  deps: AgendaProposeDeps,
  value: string,
): Promise<boolean> {
  let proposal: AgendaProposal;
  try {
    proposal = await deps.read(
      deps.propose.url,
      proposalQuery(value, deps.propose.param, deps.timeZone),
    );
  } catch {
    deps.toast(deps.failedMessage, "error");
    return false;
  }
  const placement = proposalPlacement(proposal);
  if (!placement) {
    deps.toast(deps.failedMessage, "error");
    return false;
  }
  deps.goTo(zonedDayKey(placement.start, deps.timeZone));
  deps.open(placement, {
    calendarId: proposal.calendarId,
    title: proposal.title,
    data: proposal.data,
  });
  if (proposal.message) deps.toast(proposal.message, "info");
  return true;
}
