export async function extractTextFromPDF(buffer) {
  try {
    // Dynamic import to avoid Vercel serverless startup crash with pdf-parse
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(buffer);
    return { text: data.text || "", pages: data.numpages || 1 };
  } catch (err) {
    console.error("pdf-parse error:", err.message);
    return { text: "", pages: 1 };
  }
}
