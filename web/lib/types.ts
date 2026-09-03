export type ColumnType = "number" | "string";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
}

export interface StoredDataset {
  id: string;
  name: string;
  createdAt: string;
  rowCount: number;
  columns: ColumnInfo[];
  rows: (string | number)[][];
}

export interface DatasetMeta {
  id: string;
  name: string;
  createdAt: string;
  rowCount: number;
  columns: ColumnInfo[];
  previewRows: (string | number)[][];
}

export interface ColumnSummary {
  column: string;
  type: string;
  count: number;
  missing?: number;
  min?: number;
  max?: number;
  mean?: number;
  stddev?: number;
  unique?: number;
  top_value?: string;
  top_count?: number;
}

export interface Trend {
  slope: number;
  direction: string;
  r2: number;
  delta_pct: number;
}

export interface OutlierPoint {
  row: number | string;
  value: number;
}

export interface Correlation {
  a: string;
  b: string;
  r: number;
  strength: string;
}

export interface Anomaly {
  column: string;
  zscore: number;
  value: number;
  mean: number;
}

export interface Analysis {
  rows: number;
  columns: number;
  summaries: ColumnSummary[];
  trends: Record<string, Trend>;
  outliers: Record<string, OutlierPoint[]>;
  correlations: Correlation[];
  anomalies: Anomaly[];
  insights: string[];
}
