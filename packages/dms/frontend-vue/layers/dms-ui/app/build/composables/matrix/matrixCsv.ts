import { valueText } from "./matrixValues";

const BYTE_ORDER_MARK = "﻿";
const LINE_BREAK = "\r\n";
const SEPARATOR = ",";
/** Spreadsheets run a cell starting with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
const FORMULA_GUARD = "'";
const UNSAFE_FILE_CHARACTERS = /[^\p{L}\p{N}_-]+/gu;
const FALLBACK_FILE_NAME = "matrix";
const ISO_DATE_LENGTH = 10;

/**
 * One CSV cell: quoted, its quotes doubled, a text that looks like a formula
 * kept as text (a number, negative or not, stays a number).
 */
export function csvCell(value: unknown): string {
  const text = valueText(value);
  const isFormula = typeof value !== "number" && FORMULA_START.test(text);
  const safe = isFormula ? `${FORMULA_GUARD}${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * A CSV spreadsheets open as written: UTF-8 with a byte order mark (accents
 * survive Excel), CRLF lines, a header line, and cells that look like
 * formulas kept as text.
 */
export function matrixCsv(header: unknown[], lines: unknown[][]): string {
  const body = [header, ...lines].map((line) =>
    line.map(csvCell).join(SEPARATOR),
  );
  return `${BYTE_ORDER_MARK}${body.join(LINE_BREAK)}${LINE_BREAK}`;
}

/** `stock-by-store-2026-10-25.csv`: the grid's title and the day. */
export function matrixCsvFileName(title: string, date: Date): string {
  const base =
    title
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(UNSAFE_FILE_CHARACTERS, "-")
      .replace(/^-+|-+$/g, "") || FALLBACK_FILE_NAME;
  return `${base}-${date.toISOString().slice(0, ISO_DATE_LENGTH)}.csv`;
}

/** Hands the browser a text file to save. */
export function downloadTextFile(
  fileName: string,
  content: string,
  type: string,
): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}
