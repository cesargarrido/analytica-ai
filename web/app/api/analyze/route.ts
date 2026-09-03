import { NextRequest, NextResponse } from "next/server";
import { getDataset } from "@/lib/store";

export const runtime = "nodejs";

const ENGINE_URL = (process.env.ENGINE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el id del dataset." }, { status: 400 });
    }
    const dataset = await getDataset(id);
    if (!dataset) {
      return NextResponse.json({ error: "Dataset no encontrado." }, { status: 404 });
    }

    let response: Response;
    try {
      response = await fetch(`${ENGINE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dataset.name,
          columns: dataset.columns,
          rows: dataset.rows,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error:
            `No se pudo conectar con el motor de análisis (${ENGINE_URL}). ` +
            `Arranca el motor con docker compose o npm (engine/). Detalle: ${detail}`,
        },
        { status: 503 }
      );
    }

    const analysis = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: analysis?.error ?? `El motor respondió ${response.status}.` },
        { status: 502 }
      );
    }
    return NextResponse.json({ id, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en el análisis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
