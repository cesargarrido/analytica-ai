"""
Analytica AI - Motor de análisis de patrones.

Expone un servicio FastAPI que, dado un dataset tabular (columnas + filas),
detecta de forma determinista: tendencias, outliers, correlaciones y puntos
anómalos. No requiere claves API (la IA narrativa vive en la web, opcional).
"""
import csv
import io
import math
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Analytica AI Engine", version="1.0.0")


class Column(BaseModel):
    name: str
    type: str  # 'number' | 'string'


class Dataset(BaseModel):
    name: Optional[str] = None
    columns: List[Column]
    rows: List[List[Any]]


class RawCsv(BaseModel):
    text: str
    delimiter: str = ","


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "").replace("$", "")
    if s in ("", "-", "--", "n/a", "null", "None"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: List[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def _linear_trend(values: List[float]) -> Dict[str, Any]:
    """Regresión lineal simple sobre el índice de la serie."""
    n = len(values)
    if n < 2:
        return {"slope": 0.0, "direction": "insuficiente", "r2": 0.0, "delta_pct": 0.0}
    xs = list(range(n))
    mx = _mean(xs)
    my = _mean(values)
    denom = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, values)) / denom if denom else 0.0
    y_pred = [my + slope * (x - mx) for x in xs]
    ss_res = sum((y - p) ** 2 for y, p in zip(values, y_pred))
    ss_tot = sum((y - my) ** 2 for y in values)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0

    first = values[0]
    delta_pct = ((values[-1] - first) / abs(first) * 100) if first else 0.0

    if abs(slope) < 1e-9:
        direction = "estable"
    elif slope > 0:
        direction = "creciente"
    else:
        direction = "decreciente"
    return {
        "slope": round(slope, 6),
        "direction": direction,
        "r2": round(max(0.0, min(1.0, r2)), 4),
        "delta_pct": round(delta_pct, 2),
    }


def _iqr_outliers(values: List[float], names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    if len(values) < 4:
        return []
    s = sorted(values)
    q1 = s[len(s) // 4]
    q3 = s[(3 * len(s)) // 4]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    out = []
    for i, v in enumerate(values):
        if v < lo or v > hi:
            out.append({"row": (names[i] if names else i), "value": v})
    return out


def _pearson(a: List[float], b: List[float]) -> Optional[float]:
    n = min(len(a), len(b))
    if n < 3:
        return None
    ma, mb = _mean(a[:n]), _mean(b[:n])
    cov = sum((x - ma) * (y - mb) for x, y in zip(a[:n], b[:n]))
    sa = math.sqrt(sum((x - ma) ** 2 for x in a[:n]))
    sb = math.sqrt(sum((y - mb) ** 2 for y in b[:n]))
    return cov / (sa * sb) if sa and sb else None


def _strength(r: float) -> str:
    a = abs(r)
    if a >= 0.8:
        return "muy fuerte"
    if a >= 0.6:
        return "fuerte"
    if a >= 0.4:
        return "moderada"
    if a >= 0.2:
        return "débil"
    return "muy débil"


def analyze_dataset(dataset: Dataset) -> Dict[str, Any]:
    ncols = len(dataset.columns)
    nrows = len(dataset.rows)

    numeric: Dict[int, List[Optional[float]]] = {}
    for c in range(ncols):
        if dataset.columns[c].type == "number":
            numeric[c] = [
                _to_float(r[c]) if c < len(r) else None for r in dataset.rows
            ]

    summaries = []
    trends = {}
    outliers = {}
    insights: List[str] = []

    for c, col in enumerate(dataset.columns):
        if col.type == "number":
            vals = [v for v in numeric.get(c, []) if v is not None]
            if not vals:
                summaries.append({"column": col.name, "type": "number", "count": 0})
                continue
            col_summary = {
                "column": col.name,
                "type": "number",
                "count": len(vals),
                "missing": nrows - len(vals),
                "min": round(min(vals), 4),
                "max": round(max(vals), 4),
                "mean": round(_mean(vals), 4),
                "stddev": round(_std(vals), 4),
            }
            summaries.append(col_summary)

            if len(vals) >= 3:
                trend = _linear_trend(vals)
                trends[col.name] = trend
                if trend["r2"] >= 0.5 and trend["direction"] != "estable":
                    insights.append(
                        f"{col.name} muestra una tendencia {trend['direction']} clara "
                        f"(Δ {trend['delta_pct']:+.2f}%, R² {trend['r2']})."
                    )
                elif trend["direction"] == "estable":
                    insights.append(f"{col.name} se mantiene estable en el período.")

            outs = _iqr_outliers(vals)
            if outs:
                outliers[col.name] = outs
                insights.append(
                    f"{col.name} tiene {len(outs)} valor(es) atípico(s) (regla IQR)."
                )
        else:
            values = [str(r[c]) if c < len(r) else "" for r in dataset.rows]
            top: Dict[str, int] = {}
            for v in values:
                if v == "":
                    continue
                top[v] = top.get(v, 0) + 1
            if top:
                most = max(top.items(), key=lambda kv: kv[1])
                summaries.append(
                    {
                        "column": col.name,
                        "type": "string",
                        "unique": len(top),
                        "top_value": most[0],
                        "top_count": most[1],
                    }
                )

    correlations = []
    ncols_num = [c for c in range(ncols) if dataset.columns[c].type == "number"]
    for i in range(len(ncols_num)):
        for j in range(i + 1, len(ncols_num)):
            a = ncols_num[i]
            b = ncols_num[j]
            va = [v for v in numeric.get(a, []) if v is not None]
            vb = [v for v in numeric.get(b, []) if v is not None]
            n = min(len(va), len(vb))
            if n < 3:
                continue
            r = _pearson(va[:n], vb[:n])
            if r is None:
                continue
            r = round(r, 4)
            strength = _strength(r)
            correlations.append(
                {
                    "a": dataset.columns[a].name,
                    "b": dataset.columns[b].name,
                    "r": r,
                    "strength": strength,
                }
            )
            if abs(r) >= 0.6:
                kind = "positiva" if r > 0 else "negativa"
                insights.append(
                    f"Correlación {kind} {strength} ({r:+.2f}) entre "
                    f"{dataset.columns[a].name} y {dataset.columns[b].name}."
                )

    # Anomalías: último punto a >2σ de la media (para series largas)
    anomalies = []
    for name, series in numeric.items():
        vals = [v for v in series if v is not None]
        if len(vals) < 6:
            continue
        m = _mean(vals)
        s = _std(vals)
        if s == 0:
            continue
        last = vals[-1]
        z = (last - m) / s
        if abs(z) > 2:
            anomalies.append(
                {
                    "column": dataset.columns[name].name,
                    "zscore": round(z, 3),
                    "value": round(last, 4),
                    "mean": round(m, 4),
                }
            )
            insights.append(
                f"Posible anomalía reciente en {dataset.columns[name].name} "
                f"(z={z:+.2f})."
            )

    return {
        "rows": nrows,
        "columns": ncols,
        "summaries": summaries,
        "trends": trends,
        "outliers": outliers,
        "correlations": correlations,
        "anomalies": anomalies,
        "insights": insights,
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze(payload: Dataset) -> Dict[str, Any]:
    return analyze_dataset(payload)


@app.post("/analyze-csv")
def analyze_csv(payload: RawCsv) -> Dict[str, Any]:
    text = payload.text.lstrip("\ufeff")
    reader = csv.reader(io.StringIO(text), delimiter=payload.delimiter)
    raw = [row for row in reader if any(cell.strip() for cell in row)]
    if len(raw) < 2:
        return {"error": "El CSV necesita al menos una fila de encabezado y una de datos.", "rows": 0}
    headers = [h.strip() for h in raw[0]]
    data_rows = raw[1:]
    ncols = len(headers)

    def is_number(cell: Any) -> bool:
        return _to_float(cell) is not None

    columns = []
    for c in range(ncols):
        sample = [row[c] for row in data_rows[:30] if c < len(row)]
        numeric = bool(sample) and all(is_number(v) for v in sample)
        columns.append(Column(name=headers[c], type="number" if numeric else "string"))

    normalized = []
    for row in data_rows:
        normalized.append([row[c] if c < len(row) else "" for c in range(ncols)])

    return analyze_dataset(Dataset(columns=columns, rows=normalized))
