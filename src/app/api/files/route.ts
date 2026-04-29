import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      sizeBytes: files.sizeBytes,
      mimeType: files.mimeType,
      source: files.source,
      createdAt: files.createdAt,
    })
    .from(files)
    .orderBy(desc(files.createdAt))
    .limit(100);

  return Response.json({ files: rows });
}
