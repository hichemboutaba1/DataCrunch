import Mistral from "@mistralai/mistralai";

let _client = null;
function getClient() {
  if (!_client) _client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  return _client;
}

/**
 * Run Mistral OCR on a PDF buffer.
 * Used as a fallback when pdf-parse extracts < 80 chars (scanned/image PDF).
 * Returns plain text extracted from all pages.
 */
export async function ocrPdf(buffer) {
  const base64 = buffer.toString("base64");
  const client = getClient();

  const response = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64}`,
    },
  });

  // Concatenate markdown from all pages
  return (response.pages || []).map((p) => p.markdown || "").join("\n\n");
}
