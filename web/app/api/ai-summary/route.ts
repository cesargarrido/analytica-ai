import { NextRequest, NextResponse } from "next/server";
import type { Analysis } from "@/lib/types";

export const runtime = "nodejs";

const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_BASE_URL = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

export async function POST(req: NextRequest) {
  try {
    if (!AI_API_KEY) {
      return NextResponse.json(
        { error: "IA opcional no configurada: define AI_API_KEY (y opcionalmente AI_BASE_URL/AI_MODEL) en el entorno." },
        { status: 400 }
      );
    }
    const body = await req.json();
    const analysis = body?.analysis as Analysis | undefined;
    if (!analysis) {
      return NextResponse.json({ error: "Falta el análisis para resumir." }, { status: 400 });
    }

    const payload = {
      insights: analysis.insights,
      trends: analysis.trends,
      correlations: analysis.correlations,
      anomalies: analysis.anomalies,
      rows: analysis.rows,
      columns: analysis.columns,
    };

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "Eres el asistente de Analytica AI. Explica en español, de forma breve y clara para una persona no técnica, qué revelan los datos: tendencias, outliers, correlaciones y anomalías. Máximo 180 palabras. Sin viñetas excesivas; usa prosa directa con máximo 4 bullets si aportan.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message ?? `La API de IA respondió ${response.status}`;
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const summary = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error llamando a la IA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
