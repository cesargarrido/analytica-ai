import type { ColumnInfo } from "./types";

export interface ParsedCsv {
  columns: ColumnInfo[];
  rows: (string | number)[][];
}

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = line.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return bestCount > 1 ? best : ",";
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = detectDelimiter(clean.split("\n").find((l) => l.trim()) ?? ",");
  const rows: string[][] = [];

  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushCell();
    } else if (ch === "\n") {
      if (current.trim() !== "" || row.length > 0) {
        pushRow();
      } else {
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current !== "" || row.length > 0) {
    pushRow();
  }

  const dataRows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (dataRows.length < 1) {
    return { columns: [], rows: [] };
  }

  const headers = dataRows[0].map((h) => h.trim());
  const body = dataRows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const ncols = headers.length;

  const toNumber = (v: string): number | null => {
    const s = v.trim().replace(/[$%]/g, "").replace(/,/g, "");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const columns: ColumnInfo[] = headers.map((name, c) => {
    let numeric = true;
    let seen = 0;
    for (let i = 0; i < body.length && i < 60; i++) {
      const cell = body[i][c];
      if (cell === undefined || cell.trim() === "") continue;
      seen++;
      if (toNumber(cell) === null) {
        numeric = false;
        break;
      }
    }
    return { name: name || `col_${c + 1}`, type: seen > 0 && numeric ? "number" : "string" };
  });

  const normalized: (string | number)[][] = body.map((r) =>
    r.map((cell, c) => {
      if (columns[c]?.type === "number") {
        const n = toNumber(cell);
        return n === null ? ("" as string) : n;
      }
      return cell;
    })
  );

  return { columns, rows: normalized };
}
