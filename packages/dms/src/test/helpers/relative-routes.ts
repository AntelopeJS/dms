import { MAX_RELATIVE_ROUTE } from "../../mockup";

/**
 * Paths of the site that a built page's link and a live route both accept.
 * The query and fragment ride along.
 */
export const ACCEPTED_ROUTES: readonly string[] = [
  "/",
  "/orders",
  "/orders/new",
  "/api/books?page=2&sort=-title",
  "/orders?tab=open#top",
  "/caf%C3%A9",
  "/café",
  `/${"a".repeat(MAX_RELATIVE_ROUTE - 1)}`,
];

/**
 * Paths that a built page's link and a live route both refuse: no leading
 * `/`, a host behind `//` or `/\`, a scheme, whitespace, a control
 * character that a URL parser drops, or a path over the length limit.
 */
export const REFUSED_ROUTES: readonly string[] = [
  "",
  "orders",
  "//evil.com",
  "/\\evil.com",
  "https://evil.com/x",
  "javascript:alert(1)",
  "/a b",
  "/a\u00a0b",
  "/\t/evil.example/steal",
  "/\n/evil.example/steal",
  "/\r/evil.example/steal",
  "/\u0000/evil.example/steal",
  "/a\u007f",
  `/${"a".repeat(MAX_RELATIVE_ROUTE)}`,
];
