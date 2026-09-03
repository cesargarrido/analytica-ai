import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { createDataset, listDatasets } from "@/lib/store";
import type { DatasetMeta } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const items = await listDatasets();
  return NextResponse.json({
    datasets: items.map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo CSV (campo 'file')." }, { status: 400 });
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.columns.length === 0 || parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "El CSV no tiene datos válidos (encabezado + al menos una fila)." },
        { status: 422 }
      );
    }
    const explicit = String(form.get("name") ?? "").trim();
    const name = explicit || (file.name.replace(/\.csv$/i, "") || "dataset");
    const stored = await createDataset(name, parsed);

    const meta: DatasetMeta = {
      id: stored.id,
      name: stored.name,
      createdAt: stored.createdAt,
      rowCount: stored.rowCount,
      columns: stored.columns,
      previewRows: stored.rows.slice(0, 40),
    };
    return NextResponse.json(meta, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error procesando el CSV";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
