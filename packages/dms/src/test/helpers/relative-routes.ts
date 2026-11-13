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
];

/**
 * Paths that a built page's link and a live route both refuse: no leading
 * `/`, a host behind `//` or `/\`, a scheme, whitespace, or a control
 * character that a URL parser drops.
 */
export const REFUSED_ROUTES: readonly string[] = [
  "",
  "orders",
  "//evil.com",
  "/\\evil.com",
  "https://evil.com/x",
  "javascript:alert(1)",
  "/a b",
  "/a b",
  "/\t/evil.example/steal",
  "/\n/evil.example/steal",
  "/\r/evil.example/steal",
  "/\u0000/evil.example/steal",
  "/a\u007f",
];
