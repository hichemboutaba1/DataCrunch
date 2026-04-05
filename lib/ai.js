import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const SYSTEM_PROMPT = `Tu es un expert en extraction financière pour la due diligence M&A.
Règles critiques:
- Ne JAMAIS tronquer les nombres. "39 299 894" → 39299894
- Gérer tous formats: espaces/points/virgules comme séparateurs de milliers
- Ne JAMAIS calculer les totaux, extraire uniquement les totaux déclarés dans le document
- Devises: €=EUR, $=USD, £=GBP, DH/Dhs=MAD, CHF=CHF
- Retourner UNIQUEMENT du JSON valide, sans markdown, sans commentaires
- Si une valeur est absente, utiliser null`;

function getPrompt(documentType) {
  if (documentType === "financial_statement") {
    return `Extrait les données financières de ce document et retourne un JSON avec exactement cette structure:
{
  "document_type": "financial_statement",
  "company_name": "string",
  "period": "string",
  "currency": "EUR|USD|GBP|MAD|CHF",
  "revenue": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number
  },
  "expenses": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number
  },
  "ebitda": number,
  "net_income": number,
  "assets": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number
  },
  "liabilities": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number
  }
}`;
  }
  if (documentType === "revenue_list") {
    return `Extrait les données de ce document et retourne un JSON avec exactement cette structure:
{
  "document_type": "revenue_list",
  "company_name": "string",
  "period": "string",
  "currency": "EUR|USD|GBP|MAD|CHF",
  "clients": [{"name": "string", "revenue": number, "percentage": number}],
  "total_stated": number
}`;
  }
  if (documentType === "payroll") {
    return `Extrait les données de ce document et retourne un JSON avec exactement cette structure:
{
  "document_type": "payroll",
  "company_name": "string",
  "period": "string",
  "currency": "EUR|USD|GBP|MAD|CHF",
  "employees": [{"name": "string", "role": "string", "department": "string", "gross_salary": number, "net_salary": number}],
  "total_gross_stated": number
}`;
  }
  return `Extrait les données financières de ce document et retourne du JSON valide.`;
}

async function callGroq(model, messages) {
  const completion = await groq.chat.completions.create({
    model,
    messages,
    max_tokens: 2048,
    temperature: 0.1,
  });
  return completion.choices[0]?.message?.content || "";
}

function parseJSON(text) {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function callWithFallback(messages) {
  const TIMEOUT = 45000;
  const primaryModel = "llama-3.3-70b-versatile";
  const fallbackModel = "llama-3.1-8b-instant";

  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Groq timeout")), TIMEOUT)
      ),
    ]);

  try {
    const result = await withTimeout(callGroq(primaryModel, messages));
    return result;
  } catch (err) {
    if (err.status === 429 || err.message === "Groq timeout") {
      console.warn("Groq primary failed, falling back to 8b model:", err.message);
      return withTimeout(callGroq(fallbackModel, messages));
    }
    throw err;
  }
}

function chunkText(text, maxChars = 22000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxChars));
    start += maxChars;
  }
  return chunks;
}

function mergeChunkResults(results, documentType) {
  if (results.length === 1) return results[0];
  const base = results[0];
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    if (documentType === "financial_statement") {
      if (r.revenue?.items) base.revenue.items.push(...r.revenue.items);
      if (r.expenses?.items) base.expenses.items.push(...r.expenses.items);
      if (r.assets?.items) base.assets.items.push(...r.assets.items);
      if (r.liabilities?.items) base.liabilities.items.push(...r.liabilities.items);
    } else if (documentType === "revenue_list") {
      if (r.clients) base.clients.push(...r.clients);
    } else if (documentType === "payroll") {
      if (r.employees) base.employees.push(...r.employees);
    }
  }
  return base;
}

export async function extractFinancialData(text, documentType) {
  const chunks = chunkText(text);
  const results = [];

  for (const chunk of chunks) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${getPrompt(documentType)}\n\nDocument:\n${chunk}`,
      },
    ];
    const raw = await callWithFallback(messages);
    try {
      results.push(parseJSON(raw));
    } catch {
      throw new Error(`Invalid JSON from AI: ${raw.slice(0, 200)}`);
    }
  }

  return mergeChunkResults(results, documentType);
}
