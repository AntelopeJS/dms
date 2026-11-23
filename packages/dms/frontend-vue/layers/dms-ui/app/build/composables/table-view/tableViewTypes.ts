import type { TableViewConfig } from "../../../composables/table-view/types";
import type { TableViewLiveHoldOptions } from "#dms-core/app/types/live";
export interface RealtimePresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  sessionId: string;
  since?: number;
}
export type RealtimePresenceMap = Record<string, RealtimePresenceActor[]>;
export type TableViewSetupProps<T extends Data> = TableViewConfig<T> & {
  realtimeTopic?: string | string[];
  liveHold?: boolean | TableViewLiveHoldOptions;
};
