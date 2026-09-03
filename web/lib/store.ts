import { randomUUID } from "crypto";
import { Pool } from "pg";
import type { ColumnInfo, StoredDataset } from "./types";

const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

interface RowRecord {
  columns: ColumnInfo[];
  rows: (string | number)[][];
}

function globalMemory(): Map<string, RowRecord & { name: string; createdAt: string }> {
  const g = globalThis as unknown as { __analyticaStore?: Map<string, RowRecord & { name: string; createdAt: string }> };
  if (!g.__analyticaStore) g.__analyticaStore = new Map();
  return g.__analyticaStore;
}

export async function createDataset(name: string, parsed: RowRecord): Promise<StoredDataset> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const p = getPool();
  if (p) {
    await p.query(
      `CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );
    await p.query("INSERT INTO datasets (id, name, data) VALUES ($1, $2, $3)", [
      id,
      name,
      JSON.stringify(parsed),
    ]);
  } else {
    globalMemory().set(id, { ...parsed, name, createdAt });
  }
  return { id, name, createdAt, rowCount: parsed.rows.length, columns: parsed.columns, rows: parsed.rows };
}

export async function getDataset(id: string): Promise<StoredDataset | null> {
  const p = getPool();
  if (p) {
    const { rows } = await p.query("SELECT * FROM datasets WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    const data = r.data as RowRecord;
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      rowCount: data.rows.length,
      columns: data.columns,
      rows: data.rows,
    };
  }
  const mem = globalMemory().get(id);
  if (!mem) return null;
  return { id, name: mem.name, createdAt: mem.createdAt, rowCount: mem.rows.length, columns: mem.columns, rows: mem.rows };
}

export async function listDatasets(): Promise<StoredDataset[]> {
  const p = getPool();
  if (p) {
    const { rows } = await p.query("SELECT id, name, created_at FROM datasets ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      rowCount: 0,
      columns: [],
      rows: [],
    }));
  }
  return Array.from(globalMemory().entries()).map(([id, v]) => ({
    id,
    name: v.name,
    createdAt: v.createdAt,
    rowCount: v.rows.length,
    columns: v.columns,
    rows: v.rows,
  }));
}

export async function deleteDataset(id: string): Promise<void> {
  const p = getPool();
  if (p) {
    await p.query("DELETE FROM datasets WHERE id = $1", [id]);
    return;
  }
  globalMemory().delete(id);
}
