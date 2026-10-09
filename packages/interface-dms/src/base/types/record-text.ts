/**
 * A text a route answers for a record: what a page header and its meta line
 * show. Today a string — a `$`-prefixed i18n key or a literal, written in the
 * request's language by the route when it needs a value inside it.
 *
 * Every field reading a record's text is typed with this one alias, so the
 * texts the client composes from a key and its parameters can widen it
 * without touching the fields that use it.
 */
export type RecordText = string;
