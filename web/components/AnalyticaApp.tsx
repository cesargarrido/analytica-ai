"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Analysis, DatasetMeta } from "@/lib/types";
import { Sparkline, trendColor, corrColor, type ChartKind } from "./charts";

const SAMPLE_CSV = `mes,ventas_miles,usuarios_activos,churn_pct
2025-01,120,4000,3.1
2025-02,132,4300,3.0
2025-03,128,4500,2.9
2025-04,150,5100,2.7
2025-05,165,5600,2.6
2025-06,178,6100,2.4
2025-07,540,6900,2.2
2025-08,172,7200,2.1
2025-09,188,7800,1.9
2025-10,205,8500,1.8
2025-11,222,9300,1.6
2025-12,241,10200,1.5
2026-01,255,11100,1.4
2026-02,268,12000,1.3
2026-03,281,13000,1.2
2026-04,300,14100,1.1
2026-05,318,15300,1.0
2026-06,335,16500,0.9
2026-07,352,17800,0.9
2026-08,371,19200,0.8`;

const STORAGE_KEY = "analytica-ai-config";

interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_AI: AiConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

function loadConfig(): AiConfig {
  if (typeof window === "undefined") return DEFAULT_AI;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI;
    return { ...DEFAULT_AI, ...(JSON.parse(raw) as Partial<AiConfig>) };
  } catch {
    return DEFAULT_AI;
  }
}

type Phase = "idle" | "uploading" | "analyzing" | "ready" | "error";

export function AnalyticaApp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string>("");
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [aiCfg, setAiCfg] = useState<AiConfig>(DEFAULT_AI);
  const [showAiCfg, setShowAiCfg] = useState(false);

  useEffect(() => {
    setAiCfg(loadConfig());
  }, []);

  const saveCfg = (next: AiConfig) => {
    setAiCfg(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  };

  const run = useCallback(async (file: File) => {
    setPhase("uploading");
    setError("");
    setAnalysis(null);
    setAiSummary("");
    setAiState("idle");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name.replace(/\.csv$/i, ""));
      const res = await fetch("/api/datasets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el CSV.");

      setPhase("analyzing");
      setMeta(data as DatasetMeta);
      const resA = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: (data as DatasetMeta).id }),
      });
      const dataA = await resA.json();
      if (!resA.ok) throw new Error(dataA.error ?? "No se pudo analizar.");

      setAnalysis(dataA.analysis as Analysis);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setPhase("error");
    }
  }, []);

  const onFile = (file?: File | null) => {
    if (file) void run(file);
  };

  const sparkSeries = useMemo(() => {
    if (!meta) return [];
    const numericIdx = meta.columns.map((c, i) => (c.type === "number" ? i : -1)).filter((i) => i >= 0);
    return numericIdx.map((idx) => ({
      name: meta.columns[idx].name,
      series: meta.previewRows.map((r) => r[idx]).filter((v) => typeof v === "number") as number[],
    }));
  }, [meta]);

  const runAI = useCallback(async () => {
    if (!analysis) return;
    setAiState("loading");
    setAiSummary("");
    try {
      const body: Record<string, unknown> = { analysis };
      if (aiCfg.apiKey.trim()) {
        body.ai = {
          apiKey: aiCfg.apiKey.trim(),
          baseUrl: aiCfg.baseUrl.trim() || DEFAULT_AI.baseUrl,
          model: aiCfg.model.trim() || DEFAULT_AI.model,
        };
      }
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error llamando a la IA.");
      setAiSummary(data.summary as string);
      setAiState("done");
    } catch (err) {
      setAiState("error");
      setAiSummary(err instanceof Error ? err.message : "Error.");
    }
  }, [analysis, aiCfg]);

  const busy = phase === "uploading" || phase === "analyzing";

  return (
    <main className="max-w-6xl mx-auto px-5 py-10">
      <header className="text-center mb-10">
        <p className="uppercase tracking-[0.3em] text-sm text-[#00f3ff] font-bold">Analytica AI</p>
        <h1 className="text-4xl md:text-5xl font-black mt-3 leading-tight">
          Detección de patrones <span className="text-[#00f3ff]">en tiempo real</span>
        </h1>
        <p className="text-white/55 mt-4 max-w-2xl mx-auto">
          Sube un CSV y deja que el motor Python detecte tendencias, outliers, correlaciones y anomalías.
          Sin registro.
        </p>
      </header>

      <section className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-[#00f3ff] bg-[#00f3ff]/5" : "border-white/15 bg-white/[0.03]"
            }`}
          >
            <input
              key={meta ? meta.id : "file"}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <label htmlFor="csv-file" className="cursor-pointer block">
              <div className="text-5xl mb-3">📁</div>
              <p className="font-semibold">Arrastra tu CSV aquí</p>
              <p className="text-white/45 text-sm mt-1">o haz clic para seleccionarlo</p>
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => onFile(new File([SAMPLE_CSV], "ventas-2026.csv", { type: "text/csv" }))}
              disabled={busy}
              className="rounded-xl bg-[#00f3ff] text-black font-bold py-3 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? "Procesando…" : "Probar con datos de ejemplo ✨"}
            </button>
            <button
              onClick={() => document.getElementById("csv-file")?.click()}
              disabled={busy}
              className="rounded-xl border border-white/20 py-3 font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              Subir mi propio CSV
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03]">
            <button
              onClick={() => setShowAiCfg((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/80 hover:text-white"
            >
              <span>🤖 IA opcional (resumen)</span>
              <span className="text-white/40">{showAiCfg ? "▾" : "▸"}</span>
            </button>
            {showAiCfg && (
              <div className="px-4 pb-4 space-y-3">
                <label className="block text-xs text-white/50">
                  API Key
                  <input
                    type="password"
                    value={aiCfg.apiKey}
                    onChange={(e) => saveCfg({ ...aiCfg, apiKey: e.target.value })}
                    placeholder="sk-…"
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00f3ff]"
                  />
                </label>
                <label className="block text-xs text-white/50">
                  Base URL
                  <input
                    type="text"
                    value={aiCfg.baseUrl}
                    onChange={(e) => saveCfg({ ...aiCfg, baseUrl: e.target.value })}
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f3ff]"
                  />
                </label>
                <label className="block text-xs text-white/50">
                  Modelo
                  <input
                    type="text"
                    value={aiCfg.model}
                    onChange={(e) => saveCfg({ ...aiCfg, model: e.target.value })}
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f3ff]"
                  />
                </label>
                <p className="text-[11px] text-white/35 leading-relaxed">
                  Compatible con cualquier API estilo OpenAI (OpenAI, DeepSeek…). La key se guarda{" "}
                  <b>solo en tu navegador</b> (localStorage) y viaja al servidor únicamente al pulsar el
                  botón de resumen.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200 whitespace-pre-line">
              {error}
            </div>
          )}
        </div>

        <div className="md:col-span-3 space-y-5">
          {phase === "idle" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/50 text-sm leading-relaxed">
              <p className="font-semibold text-white/80 mb-2">Así funciona</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Subes un CSV con una primera fila de encabezados.</li>
                <li>Se detectan columnas numéricas y de texto automáticamente.</li>
                <li>El motor calcula tendencia (regresión), outliers (IQR), correlaciones y anomalías recientes.</li>
                <li>Opcional: resumen narrativo con IA (configúralo en el panel de la izquierda).</li>
              </ol>
            </div>
          )}

          {busy && (
            <div className="rounded-2xl border border-white/10 p-10 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#00f3ff]" />
              <p className="mt-4 text-white/60">
                {phase === "uploading" ? "Guardando dataset…" : "Detectando patrones…"}
              </p>
            </div>
          )}

          {phase === "ready" && meta && analysis && (
            <Results
              meta={meta}
              analysis={analysis}
              sparkSeries={sparkSeries}
              hasAiKey={Boolean(aiCfg.apiKey.trim())}
              aiSummary={aiSummary}
              aiState={aiState}
              onAI={runAI}
              onReset={() => {
                setMeta(null);
                setAnalysis(null);
                setPhase("idle");
                setAiSummary("");
                setAiState("idle");
              }}
            />
          )}
        </div>
      </section>

      <footer className="mt-14 text-center text-xs text-white/35">
        Analytica AI · Next.js + Python (FastAPI) + PostgreSQL · IA opcional
      </footer>
    </main>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm uppercase tracking-wider text-[#00f3ff]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ChartTypeToggle({ value, onChange }: { value: ChartKind; onChange: (k: ChartKind) => void }) {
  const options: { key: ChartKind; label: string }[] = [
    { key: "line", label: "Línea" },
    { key: "area", label: "Área" },
    { key: "bar", label: "Barras" },
  ];
  return (
    <div className="flex rounded-lg border border-white/15 overflow-hidden">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.key ? "bg-[#00f3ff] text-black" : "text-white/55 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Results({
  meta,
  analysis,
  sparkSeries,
  hasAiKey,
  aiSummary,
  aiState,
  onAI,
  onReset,
}: {
  meta: DatasetMeta;
  analysis: Analysis;
  sparkSeries: { name: string; series: number[] }[];
  hasAiKey: boolean;
  aiSummary: string;
  aiState: "idle" | "loading" | "done" | "error";
  onAI: () => void;
  onReset: () => void;
}) {
  const numericSummary = analysis.summaries.filter((s) => s.type === "number");
  const textSummary = analysis.summaries.filter((s) => s.type === "string");
  const [chartKind, setChartKind] = useState<ChartKind>("line");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold truncate">{meta.name}</h3>
          <p className="text-white/45 text-sm">
            {meta.rowCount.toLocaleString("es")} filas · {analysis.columns} columnas
          </p>
        </div>
        <button onClick={onReset} className="text-sm text-white/50 hover:text-white border border-white/15 rounded-lg px-3 py-2">
          Nuevo análisis
        </button>
      </div>

      {analysis.insights.length > 0 && (
        <Card title="Hallazgos">
          <ul className="space-y-2">
            {analysis.insights.map((ins, i) => (
              <li key={i} className="flex gap-2 text-sm text-white/80">
                <span className="text-[#00f3ff]">▸</span>
                {ins}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {numericSummary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {numericSummary.map((s) => (
            <div key={s.column} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-white/45 truncate">{s.column}</p>
              <p className="text-xl font-bold mt-1">{formatNum(s.mean)}</p>
              <p className="text-[11px] text-white/40 mt-1">
                min {formatNum(s.min)} · máx {formatNum(s.max)}
              </p>
              <p className="text-[11px] text-white/40">σ {formatNum(s.stddev)}</p>
            </div>
          ))}
        </div>
      )}

      {sparkSeries.length > 0 && (
        <Card title="Tendencias" right={<ChartTypeToggle value={chartKind} onChange={setChartKind} />}>
          <div className="grid sm:grid-cols-2 gap-5">
            {sparkSeries.map(({ name, series }) => {
              const trend = analysis.trends[name];
              return (
                <div key={name} className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold truncate">{name}</span>
                    {trend && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: trendColor(trend.direction), background: `${trendColor(trend.direction)}1a` }}
                      >
                        {trend.direction.toUpperCase()} {trend.delta_pct >= 0 ? "+" : ""}
                        {trend.delta_pct}%
                      </span>
                    )}
                  </div>
                  <Sparkline data={series} kind={chartKind} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {analysis.correlations.length > 0 && (
        <Card title="Correlaciones numéricas">
          <div className="space-y-2">
            {analysis.correlations.map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-1/3 truncate">{c.a}</span>
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(4, Math.abs(c.r) * 100)}%`,
                      background: corrColor(c.r),
                    }}
                  />
                </div>
                <span className="w-1/3 text-right truncate text-white/55">
                  {c.b} · <b>{c.r > 0 ? "+" : ""}{c.r.toFixed(2)}</b> ({c.strength})
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {textSummary.length > 0 && (
        <Card title="Columnas de texto">
          <div className="grid sm:grid-cols-2 gap-3">
            {textSummary.map((s) => (
              <div key={s.column} className="text-sm bg-white/[0.03] rounded-lg p-3">
                <p className="text-white/45 text-xs">{s.column}</p>
                <p className="mt-1">
                  Valor más común: <b>{s.top_value}</b>{" "}
                  <span className="text-white/45">({s.top_count}/{analysis.rows})</span>
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(Object.keys(analysis.outliers).length > 0 || analysis.anomalies.length > 0) && (
        <Card title="Outliers y anomalías">
          {Object.keys(analysis.outliers).length > 0 && (
            <div className="space-y-2 mb-4">
              {Object.entries(analysis.outliers).map(([col, pts]) => (
                <p key={col} className="text-sm text-white/80">
                  <b>{col}</b>: {pts.map((p) => `fila ${p.row} = ${formatNum(p.value)}`).join(" · ")}
                </p>
              ))}
            </div>
          )}
          {analysis.anomalies.length > 0 && (
            <ul className="space-y-1 text-sm text-white/80">
              {analysis.anomalies.map((a, i) => (
                <li key={i}>
                  ⚠ {a.column}: valor reciente {formatNum(a.value)} vs media {formatNum(a.mean)}{" "}
                  (z={a.zscore > 0 ? "+" : ""}{a.zscore.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Resumen con IA (opcional)">
        <div className="space-y-3">
          {!hasAiKey && (
            <p className="text-xs text-white/40">
              Configura la API key en el panel «IA opcional» de la izquierda (o define AI_API_KEY en el servidor).
            </p>
          )}
          {aiState === "idle" && (
            <button
              onClick={onAI}
              disabled={!hasAiKey}
              className="rounded-xl border border-[#00f3ff]/60 text-[#00f3ff] font-semibold px-4 py-2.5 hover:bg-[#00f3ff]/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✨ Explicar hallazgos con IA
            </button>
          )}
          {aiState === "loading" && <p className="text-white/50 text-sm">Generando resumen…</p>}
          {aiState === "done" && aiSummary && (
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-line">{aiSummary}</p>
          )}
          {aiState === "error" && (
            <p className="text-sm text-amber-200/90 whitespace-pre-line">{aiSummary}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function formatNum(v?: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(v);
}
