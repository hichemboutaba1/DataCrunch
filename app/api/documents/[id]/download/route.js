import { getUserFromRequest } from "@/lib/auth";
import { loadDB } from "@/lib/db";

export async function GET(request, { params }) {
  const payload = await getUserFromRequest(request);
  if (!payload) return new Response("Unauthorized", { status: 401 });

  const db = loadDB();
  const doc = db.documents.find(
    (d) => d.id === parseInt(params.id) && d.organization_id === payload.orgId
  );

  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.status !== "completed" || !doc.excel_buffer) {
    return new Response("Not ready", { status: 400 });
  }

  const buffer = Buffer.from(doc.excel_buffer);
  const filename = doc.filename.replace(".pdf", ".xlsx");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
