import pdfParse from "pdf-parse";

// Clean and normalize extracted PDF text for better AI parsing
function cleanText(raw) {
  return raw
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    // Fix words broken across lines with hyphen
    .replace(/(\w)-\n(\w)/g, "$1$2")
    // Normalize spaces (but keep newlines)
    .replace(/[ \t]{2,}/g, "  ")
    // Fix numbers split across lines: "39 299\n894" → "39299894" is risky, skip
    // But fix obvious cases: digit newline digit with small gap
    .replace(/(\d)\n(\d{3})\b/g, "$1$2")
    .trim();
}

// Add column-alignment hints for table-like content
function detectAndFormatTables(text) {
  const lines = text.split("\n");
  const result = [];

  for (const line of lines) {
    // If line has multiple large gaps (likely a table row), add pipe separators
    // Pattern: text [2+ spaces] number [2+ spaces] number
    const tableRow = line.match(/^(.+?)\s{3,}(-?[\d\s,.]+(?:€|\$|USD|EUR)?)\s*$/);
    if (tableRow) {
      // Normalize the amount: remove internal spaces (e.g. "39 299 894" → "39299894")
      const label = tableRow[1].trim();
      const amount = tableRow[2].replace(/\s+/g, "").trim();
      result.push(`${label}  |  ${amount}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

export async function extractPdfText(buffer) {
  const data = await pdfParse(buffer, {
    // Preserve layout to help with table extraction
    pagerender: undefined,
  });

  const raw = data.text;
  const cleaned = cleanText(raw);
  const formatted = detectAndFormatTables(cleaned);

  return {
    text: formatted,
    rawText: raw,
    pages: data.numpages,
  };
}
