import { getUserFromRequest } from "@/lib/auth";
import { loadDB } from "@/lib/db";
import { generateExcel } from "@/lib/excel";

export async function GET(request, { params }) {
  const payload = await getUserFromRequest(request);
  if (!payload) return new Response("Unauthorized", { status: 401 });

  const db = await loadDB();
  const doc = db.documents.find(
    (d) => d.id === parseInt(params.id) && d.organization_id === payload.orgId
  );

  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.status !== "completed" || !doc.extracted_data) {
    return new Response("Not ready", { status: 400 });
  }

  // Regenerate Excel from extracted_data — we no longer store the binary buffer
  // in the DB to keep Upstash under size limits.
  const buffer = await generateExcel(doc.extracted_data);
  const filename = doc.filename.replace(/\.pdf$/i, "") + "_DataCrunch.xlsx";

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
