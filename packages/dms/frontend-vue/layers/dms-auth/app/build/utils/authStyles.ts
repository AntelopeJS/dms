import { TEXT_LINK_CLASS } from "#dms-ui/app/build/utils/textLink";

/**
 * v2 .au-link: the accent text link of the auth cards. Below `sm` an invisible
 * box stretches its hit area to about 32px tall, so the small text stays easy
 * to tap without moving anything around it.
 */
export const AUTH_LINK_CLASS = `${TEXT_LINK_CLASS} max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-1.5 max-sm:after:content-['']`;
