import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return e.message || e.name;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  if (!deep) {
    return NextResponse.json({
      status: "ok",
      service: "agb-crm",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "agb-crm",
        database: "unavailable",
        error: describeError(e),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    service: "agb-crm",
    database: "available",
    timestamp: new Date().toISOString(),
  });
}
