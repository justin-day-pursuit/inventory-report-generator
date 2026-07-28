/**
 * ============================================================================
 * CSV READER / WRITER (lib/csv.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * The inventory data now lives in a spreadsheet-style file
 * (data/inventory/inventory.csv) instead of JSON. This file contains two small
 * helpers that turn that text into rows the rest of the app can work with, and
 * back again:
 *
 *   parseCsv(text)      → { header: [...column names], rows: [...{column: value}] }
 *   serializeCsv(table) → CSV text ready to be saved back to disk
 *
 * HOW TO MAINTAIN (non-technical):
 * - You never need to edit this file when the dataset gains a new column. The
 *   parser simply keeps every column it finds, using the first line of the file
 *   as the list of column names.
 * - Values that contain a comma, a quote, or a line break are wrapped in double
 *   quotes automatically when saving — exactly like Excel / Google Sheets do.
 * - Nothing here knows about dairy products. Column meanings are decided in
 *   lib/data-store.ts.
 * ============================================================================
 */

/** A whole spreadsheet: the column names plus one object per data row. */
export type CsvTable = {
  /** Column names, in the same left-to-right order as the file. */
  header: string[];
  /** One entry per data line: { "Column name": "cell value", ... }. */
  rows: Record<string, string>[];
};

/**
 * Splits one line of raw CSV text into its individual cell values.
 * Handles quoted cells ("Amul, Ltd") and escaped quotes ("say ""hi""").
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (insideQuotes) {
      if (char === '"') {
        // Two quotes in a row mean "a real quote character", not the end of the cell.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Turns CSV text into a table object.
 *
 * - The first non-empty line is treated as the column names.
 * - Empty lines are skipped, so a trailing newline at the end of the file is fine.
 * - Rows with fewer cells than the header get empty strings for the missing ones.
 */
export function parseCsv(text: string): CsvTable {
  // Remove the invisible "byte order mark" some spreadsheet programs add,
  // then accept Windows (\r\n) and Mac/Linux (\n) line endings alike.
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = clean.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((column, index) => {
      row[column] = cells[index] ?? "";
    });
    return row;
  });

  return { header, rows };
}

/** Wraps a single cell value in quotes only when it actually needs them. */
function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * Turns a table object back into CSV text (header line first, then the rows).
 * Column order always follows `table.header`, so saved files stay readable.
 */
export function serializeCsv(table: CsvTable): string {
  const headerLine = table.header.map(escapeCsvCell).join(",");
  const dataLines = table.rows.map((row) =>
    table.header.map((column) => escapeCsvCell(row[column] ?? "")).join(",")
  );
  return `${[headerLine, ...dataLines].join("\n")}\n`;
}
