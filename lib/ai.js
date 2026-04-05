import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const SYSTEM_PROMPT = `Tu es un expert en extraction financière pour la due diligence M&A.
RÈGLE ABSOLUE: Retourner UNIQUEMENT le JSON brut, SANS aucun texte avant ou après, SANS balises markdown, SANS explication.
Ta réponse doit commencer par { et se terminer par }.
Autres règles:
- Ne JAMAIS tronquer les nombres. "39 299 894" → 39299894
- Gérer tous formats: espaces/points/virgules comme séparateurs de milliers
- Ne JAMAIS calculer les totaux, extraire uniquement les totaux déclarés dans le document
- Devises: €=EUR, $=USD, £=GBP, DH/Dhs=MAD, CHF=CHF, AED=AED, A$=AUD, C$=CAD, R$=BRL, ¥=JPY, ¥=CNY, ₹=INR, MX$=MXN, S$=SGD, kr=SEK/NOK
- Si une valeur est absente, utiliser null`;

function getPrompt(documentType) {
  if (documentType === "financial_statement") {
    return `Extrait les données financières de ce document et retourne un JSON avec exactement cette structure:
{
  "document_type": "financial_statement",
  "company_name": "string",
  "period": "string",
  "currency": "EUR|USD|GBP|MAD|CHF|AED|AUD|CAD|BRL|JPY|CNY|INR|MXN|SGD|SEK|NOK",
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
  "currency": "EUR|USD|GBP|MAD|CHF|AED|AUD|CAD|BRL|JPY|CNY|INR|MXN|SGD|SEK|NOK",
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
  "currency": "EUR|USD|GBP|MAD|CHF|AED|AUD|CAD|BRL|JPY|CNY|INR|MXN|SGD|SEK|NOK",
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
    max_tokens: 2000,
    temperature: 0.1,
  });
  return completion.choices[0]?.message?.content || "";
}

function parseJSON(text) {
  // 1. Try to extract from ```json ... ``` block anywhere in text
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  // 2. Try to find first { ... } JSON object in text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }

  // 3. Last resort: parse as-is
  return JSON.parse(text.trim());
}

async function callWithFallback(messages) {
  const TIMEOUT = 90000;
  const primaryModel = "llama-3.3-70b-versatile";
  const fallbackModel = "llama-3.1-8b-instant";

  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Groq timeout")), TIMEOUT)
      ),
    ]);

  // Truncate text content if too long (keep under ~3500 tokens ≈ 14000 chars)
  const truncateMessages = (msgs, maxChars = 14000) => {
    return msgs.map((m) => {
      if (m.role === "user" && m.content.length > maxChars) {
        return { ...m, content: m.content.slice(0, maxChars) + "\n\n[Document tronqué pour respecter les limites de l'API]" };
      }
      return m;
    });
  };

  try {
    const result = await withTimeout(callGroq(primaryModel, messages));
    return result;
  } catch (err) {
    // 429 = rate limit, 413 = too large, timeout
    if (err.status === 429 || err.status === 413 || err.message === "Groq timeout") {
      console.warn("Groq primary failed, falling back to 8b model:", err.status, err.message);
      const truncated = truncateMessages(messages);
      return withTimeout(callGroq(fallbackModel, truncated));
    }
    throw err;
  }
}

function chunkText(text, maxChars = 12000) {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current);
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
