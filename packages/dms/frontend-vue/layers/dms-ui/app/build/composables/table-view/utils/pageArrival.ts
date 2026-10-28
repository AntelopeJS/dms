/**
 * How the page shown was reached: a full load of the document (a reload, a
 * URL typed or opened in a new browser tab), an Inertia visit (a link, a
 * redirect), or Back and Forward.
 */
export type PageArrivalKind = "load" | "visit" | "history";

let arrivalKind: PageArrivalKind = "load";
let isTracking = false;

/**
 * Starts following how each page is reached, once, when the app starts: a
 * table mounted later must still see the visit that brought it. A server
 * render never tracks, so it and the hydrating client both read a full load.
 */
export function trackPageArrivals(): void {
  if (typeof document === "undefined" || isTracking) return;
  isTracking = true;

  document.addEventListener("inertia:before", (event) => {
    const { visit } = event.detail;
    if (!visit.prefetch) arrivalKind = "visit";
  });
  window.addEventListener("popstate", () => {
    arrivalKind = "history";
  });
}

/** How the page shown was reached (`trackPageArrivals`). */
export const pageArrivalKind = (): PageArrivalKind => arrivalKind;
