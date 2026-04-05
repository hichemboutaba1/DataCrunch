import pdfParse from "pdf-parse";

export async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return { text: data.text || "", pages: data.numpages || 1 };
  } catch (err) {
    console.error("pdf-parse error:", err.message);
    return { text: "", pages: 1 };
  }
}
