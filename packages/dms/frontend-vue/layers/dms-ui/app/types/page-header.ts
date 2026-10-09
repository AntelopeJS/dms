import type { RecordData, RecordText } from "./record-action";
import type { Tone } from "./tone";

/** Where a page header reads its record (`DefaultLayout({ header })`). */
export interface PageHeaderSource {
  /** Answers a `PageHeaderRecord`; `{{params.X}}` / `{{query.X}}` filled. */
  fetchUrl: string;
}

/** The picture leading a record's header. */
export interface PageHeaderAvatar {
  src?: string;
  initials?: string;
}

/** The status pill right of a record's title. */
export interface PageHeaderStatus {
  label: RecordText;
  tone?: Tone;
}

/** A badge right of a record's title. */
export interface PageHeaderBadge {
  label: RecordText;
  tone?: Tone;
  icon?: string;
}

/** One entry of the meta line under a record's title. */
export interface PageHeaderMetaItem {
  label?: RecordText;
  value?: RecordText;
  icon?: string;
  tone?: Tone;
  mono?: boolean;
}

/** What `header.fetchUrl` answers (`PageHeaderRecord` of interface-dms). */
export interface PageHeaderRecord {
  title?: RecordText;
  subtitle?: RecordText;
  avatar?: PageHeaderAvatar;
  icon?: string;
  status?: PageHeaderStatus;
  badges?: PageHeaderBadge[];
  meta?: PageHeaderMetaItem[];
  /** What the actions' conditions read; defaults to the whole answer. */
  record?: RecordData;
}

/** What a page header shows of its record, beside its title and text. */
export type PageHeaderDetails = Pick<
  PageHeaderRecord,
  "avatar" | "status" | "badges" | "meta"
>;
