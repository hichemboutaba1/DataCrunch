import Groq from "groq-sdk";

// Lazy init — avoids crash at build time when env vars are not yet available
let _client = null;
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `You are a financial data extraction specialist for M&A due diligence.
Your ONLY job is to extract numbers EXACTLY as written in the document.

CRITICAL NUMBER FORMATTING RULES:
- Numbers may use spaces, dots, or commas as thousands separators. ALWAYS output the full plain integer.
  Examples: "39 299 894" → 39299894 | "39.299.894" → 39299894 | "39,299,894" → 39299894
- NEVER truncate or shorten numbers. "39 299 894" is thirty-nine MILLION, not 392994.
- If a value is in thousands (e.g. document says "in thousands" or "en milliers"), multiply each number by 1000.
- Decimal separators: "392,998.50" → 392998.5 | "392.998,50" → 392998.5
- Table rows may appear as "Label  |  Amount" — extract the label and the amount separately.
- ALL numeric values must be plain integers or decimals, NEVER strings or expressions.
- If a value is not present in the document, use null — do NOT guess.
- Do NOT calculate any totals yourself — only extract stated totals from the document.
- Extract line item labels EXACTLY as they appear in the document.
- Return ONLY valid JSON. No markdown, no comments, no explanations.

CURRENCY DETECTION:
- Look for currency symbols: € = EUR, $ = USD, £ = GBP, CHF = CHF, MAD = MAD, DH = MAD
- If you see "DH" or "Dhs" → currency is "MAD"
- If you see "CHF" → currency is "CHF"
- If the document is French and no currency shown → default to "EUR"
- NEVER assume EUR if another currency is indicated`;

const PROMPTS = {
  financial_statement: `Extract every line item from this financial document.
Return this exact JSON structure (only extract what is explicitly in the document):
{
  "document_type": "financial_statement",
  "company_name": "exact company name or null",
  "period": "exact period as written or null",
  "currency": "currency code (EUR/USD/GBP/CHF/MAD etc) or null",
  "revenue": {
    "items": [{"label": "exact label from document", "amount": number, "page": null}],
    "total_stated": number or null
  },
  "expenses": {
    "items": [{"label": "exact label from document", "amount": number, "page": null}],
    "total_stated": number or null
  },
  "ebitda": number or null,
  "net_income": number or null,
  "assets": {
    "items": [{"label": "exact label from document", "amount": number, "page": null}],
    "total_stated": number or null
  },
  "liabilities": {
    "items": [{"label": "exact label from document", "amount": number, "page": null}],
    "total_stated": number or null
  }
}`,

  revenue_list: `Extract every client and revenue line from this document.
Return this exact JSON:
{
  "document_type": "revenue_list",
  "company_name": "exact name or null",
  "period": "exact period or null",
  "currency": "currency code (EUR/USD/GBP/CHF/MAD etc) or null",
  "clients": [
    {"name": "exact client name", "revenue": number, "percentage": number or null, "contract_type": "exact value or null"}
  ],
  "total_stated": number or null
}`,

  payroll: `Extract every person/employee entry and their salary from this document.
This could be a payroll list, bulletin de salaire, fiche de paie, staff list, masse salariale, or any document listing people with compensation.
Look for: names, employee IDs, salaires brut/net, wages, roles, departments.
Even if format is unusual, extract every row. Handle French payslip fields:
- "Salaire de base" / "Salaire brut" → gross_salary
- "Net à payer" / "Salaire net" → net_salary
- "Nom" / "Prénom" → name
- "Poste" / "Fonction" → role
- "Service" / "Département" → department
Return this exact JSON:
{
  "document_type": "payroll",
  "company_name": "company name from document or null",
  "period": "period/date from document or null",
  "currency": "currency code (EUR/MAD/CHF etc) or null",
  "employees": [
    {
      "name": "person full name or employee ID",
      "role": "job title or null",
      "department": "department or null",
      "gross_salary": number (use 0 only if truly absent),
      "net_salary": number or null
    }
  ],
  "total_gross_stated": number or null
}
Extract EVERY person found. If a column is missing use null.`,

  payslip: `This is a single employee payslip (bulletin de salaire / fiche de paie).
Extract the employee information and salary details.
Return this exact JSON:
{
  "document_type": "payroll",
  "company_name": "employer/company name or null",
  "period": "pay period (month/year) or null",
  "currency": "currency code or null",
  "employees": [
    {
      "name": "employee full name",
      "role": "job title / poste or null",
      "department": "department / service or null",
      "gross_salary": number (salaire brut),
      "net_salary": number (net à payer) or null,
      "employee_id": "employee number or null"
    }
  ],
  "total_gross_stated": null
}`,
};

// Race a promise against a timeout — prevents Groq from hanging indefinitely
function withTimeout(promise, ms, label = "operation") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// Parse error to detect Groq rate limit (429)
function isRateLimit(err) {
  return err?.status === 429 ||
    err?.message?.toLowerCase().includes("rate limit") ||
    err?.message?.toLowerCase().includes("429");
}

async function callGroq(prompt, text, chunkInfo = "") {
  const userContent = `${prompt}\n\n${chunkInfo}DOCUMENT TEXT:\n${text}`;
  const TIMEOUT_MS = 45000; // 45s — leaves buffer within 120s Vercel max

  // Models in priority order — fallback to smaller model on rate limit
  const MODELS = [
    "llama-3.3-70b-versatile",   // best accuracy
    "llama-3.1-8b-instant",      // fallback: 500K TPD free, faster but less precise
  ];

  const makeCall = (model, jsonFormat) =>
    getClient().chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      max_tokens: 2048,
      ...(jsonFormat ? { response_format: { type: "json_object" } } : {}),
    });

  const parseResponse = (content) => {
    const raw = content.trim();
    const clean = raw.includes("```json")
      ? raw.split("```json")[1].split("```")[0].trim()
      : raw.includes("```") ? raw.split("```")[1].split("```")[0].trim() : raw;
    return JSON.parse(clean);
  };

  let lastErr;
  for (const model of MODELS) {
    try {
      // Attempt with JSON response_format
      try {
        const res = await withTimeout(makeCall(model, true), TIMEOUT_MS, `Groq (${model})`);
        return JSON.parse(res.choices[0].message.content);
      } catch (err) {
        if (err.message?.includes("timed out")) throw err;
        if (isRateLimit(err)) throw err; // jump to next model
        // JSON format rejected — retry without it
        const res = await withTimeout(makeCall(model, false), TIMEOUT_MS, `Groq (${model})`);
        return parseResponse(res.choices[0].message.content);
      }
    } catch (err) {
      lastErr = err;
      if (isRateLimit(err)) {
        console.warn(`Rate limit on ${model}, trying next model…`);
        continue; // try next model
      }
      throw err; // timeout or parse error — don't try other models
    }
  }

  // All models rate-limited
  throw new Error("Groq API rate limit reached on all models — please try again tomorrow or upgrade at console.groq.com");
}

// Merge multiple chunk extractions into one
function mergeExtractions(results, documentType) {
  const base = results[0];
  if (results.length === 1) return base;

  if (documentType === "financial_statement") {
    for (const r of results.slice(1)) {
      if (!base.company_name && r.company_name) base.company_name = r.company_name;
      if (!base.period && r.period) base.period = r.period;
      if (!base.currency && r.currency) base.currency = r.currency;
      if (!base.ebitda && r.ebitda) base.ebitda = r.ebitda;
      if (!base.net_income && r.net_income) base.net_income = r.net_income;
      for (const sec of ["revenue", "expenses", "assets", "liabilities"]) {
        if (r[sec]?.items?.length) {
          if (!base[sec]) base[sec] = { items: [], total_stated: null };
          const existingLabels = new Set(base[sec].items.map(i => i.label));
          for (const item of r[sec].items) {
            if (!existingLabels.has(item.label)) {
              base[sec].items.push(item);
              existingLabels.add(item.label);
            }
          }
          if (!base[sec].total_stated && r[sec].total_stated) {
            base[sec].total_stated = r[sec].total_stated;
          }
        }
      }
    }
  } else if (documentType === "revenue_list") {
    for (const r of results.slice(1)) {
      if (!base.company_name && r.company_name) base.company_name = r.company_name;
      if (!base.currency && r.currency) base.currency = r.currency;
      if (r.clients?.length) {
        const existingNames = new Set(base.clients?.map(c => c.name) || []);
        for (const c of r.clients) {
          if (!existingNames.has(c.name)) {
            base.clients = base.clients || [];
            base.clients.push(c);
            existingNames.add(c.name);
          }
        }
      }
      if (!base.total_stated && r.total_stated) base.total_stated = r.total_stated;
    }
  } else if (documentType === "payroll" || documentType === "payslip") {
    for (const r of results.slice(1)) {
      if (!base.company_name && r.company_name) base.company_name = r.company_name;
      if (!base.currency && r.currency) base.currency = r.currency;
      if (r.employees?.length) {
        const existingNames = new Set(base.employees?.map(e => e.name) || []);
        for (const e of r.employees) {
          if (!existingNames.has(e.name)) {
            base.employees = base.employees || [];
            base.employees.push(e);
            existingNames.add(e.name);
          }
        }
      }
    }
    base.document_type = "payroll";
  }

  return base;
}

const CHUNK_SIZE = 22000;

export async function extractFinancialData(text, documentType) {
  const prompt = PROMPTS[documentType] || PROMPTS.financial_statement;

  // Single chunk — fast path
  if (text.length <= CHUNK_SIZE) {
    return await callGroq(prompt, text);
  }

  // Multi-chunk for long documents
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  const results = [];
  for (let i = 0; i < Math.min(chunks.length, 4); i++) {
    const chunkInfo = chunks.length > 1 ? `[Part ${i + 1} of ${chunks.length}] ` : "";
    results.push(await callGroq(prompt, chunks[i], chunkInfo));
  }

  return mergeExtractions(results, documentType);
}

// For batch payslip processing (individual bulletins de salaire)
export async function extractPayslip(text) {
  return await callGroq(PROMPTS.payslip, text);
}
