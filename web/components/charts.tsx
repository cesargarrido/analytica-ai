"use client";

export type ChartKind = "line" | "area" | "bar";

interface ChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  kind?: ChartKind;
}

export function Sparkline({ data, width = 240, height = 64, color = "#00f3ff", kind = "line" }: ChartProps) {
  const values = data.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (values.length < 1) {
    return (
      <div className="text-xs text-white/40" style={{ height }}>
        Sin serie suficiente para graficar
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;

  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y, v };
  });

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  if (kind === "bar") {
    const bw = Math.max(2, (width - pad * 2) / values.length - 2);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-hidden="true">
        {pts.map((p, i) => {
          const h = Math.max(1, (p.v - min) / range * (height - pad * 2));
          return (
            <rect
              key={i}
              x={p.x - bw / 2}
              y={height - pad - h}
              width={bw}
              height={h}
              rx={2}
              fill={color}
              opacity={0.85}
            />
          );
        })}
      </svg>
    );
  }

  if (kind === "area") {
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height - pad} L${pts[0].x.toFixed(1)},${height - pad} Z`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-hidden="true">
        <path d={area} fill={color} opacity={0.18} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-hidden="true">
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
    </svg>
  );
}

export function trendColor(direction: string): string {
  if (direction === "creciente") return "#34d399";
  if (direction === "decreciente") return "#f87171";
  return "#94a3b8";
}

export function corrColor(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.8) return r > 0 ? "rgba(52,211,153,0.85)" : "rgba(248,113,113,0.85)";
  if (a >= 0.5) return r > 0 ? "rgba(52,211,153,0.45)" : "rgba(248,113,113,0.45)";
  return "rgba(148,163,184,0.25)";
}
