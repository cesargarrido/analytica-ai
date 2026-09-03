import { NextRequest, NextResponse } from "next/server";
import type { Analysis } from "@/lib/types";

export const runtime = "nodejs";

const ENV_API_KEY = process.env.AI_API_KEY ?? "";
const ENV_BASE_URL = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const ENV_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

interface AiOverride {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export async function GET() {
  return NextResponse.json({
    apiKeyConfigured: Boolean(ENV_API_KEY),
    model: ENV_MODEL,
    baseUrl: ENV_BASE_URL,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const analysis = body?.analysis as Analysis | undefined;
    if (!analysis) {
      return NextResponse.json({ error: "Falta el análisis para resumir." }, { status: 400 });
    }

    const override = (body?.ai ?? {}) as AiOverride;
    const apiKey = (override.apiKey ?? ENV_API_KEY).trim();
    const baseUrl = (override.baseUrl ?? ENV_BASE_URL).replace(/\/$/, "").trim() || "https://api.openai.com/v1";
    const model = (override.model ?? ENV_MODEL).trim() || "gpt-4o-mini";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "IA opcional no configurada: añade tu API key en el panel «IA opcional» de la app, " +
            "o define AI_API_KEY en el servidor.",
        },
        { status: 400 }
      );
    }

    const payload = {
      insights: analysis.insights,
      trends: analysis.trends,
      correlations: analysis.correlations,
      anomalies: analysis.anomalies,
      rows: analysis.rows,
      columns: analysis.columns,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
