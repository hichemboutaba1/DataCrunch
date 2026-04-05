import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || "" });

export async function ocrPDF(buffer) {
  const base64 = buffer.toString("base64");
  try {
    const response = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: `data:application/pdf;base64,${base64}`,
      },
    });
    // Concatenate all page texts
    const text = (response.pages || []).map((p) => p.markdown || "").join("\n\n");
    return text;
  } catch (err) {
    console.error("Mistral OCR error:", err.message);
    return "";
  }
}
