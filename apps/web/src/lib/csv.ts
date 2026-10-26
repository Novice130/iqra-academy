/**
 * @fileoverview CSV building for admin exports, server or client.
 *
 * Two things every export got wrong before this existed: a comma or quote in
 * a name shifted every column after it, and a cell starting with = + - @ is
 * run as a formula when the file is opened in Excel or Sheets.
 *
 * @module lib/csv
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

/** One cell, quoted when needed and defused if it would read as a formula. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A whole file: header row, then one row per record, CRLF line endings. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
