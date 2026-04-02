import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a financial data extraction specialist for M&A due diligence.
Your ONLY job is to extract numbers EXACTLY as written in the document.
RULES:
- Extract line items EXACTLY as they appear — do NOT paraphrase labels
- For amounts, use the EXACT number from the document — do NOT round or estimate
- If a value is not present, use null
- Return ONLY valid JSON with no markdown, no comments, no explanations
- Do NOT calculate any totals yourself — only extract stated totals from the document
- ALL numeric values must be plain numbers (e.g. 92998), never strings or expressions`;

const PROMPTS = {
  financial_statement: `Extract every line item from this financial document.
Return this exact JSON structure (only extract what is explicitly in the document):
{
  "document_type": "financial_statement",
  "company_name": "exact company name or null",
  "period": "exact period as written or null",
  "currency": "currency code or null",
  "revenue": {
    "items": [{"label": "exact label from document", "amount": number}],
    "total_stated": "exact total as written in document or null"
  },
  "expenses": {
    "items": [{"label": "exact label from document", "amount": number}],
    "total_stated": null
  },
  "ebitda": "exact EBITDA value from document or null",
  "net_income": "exact net income value from document or null",
  "assets": {
    "items": [{"label": "exact label from document", "amount": number}],
    "total_stated": "exact total as written or null"
  },
  "liabilities": {
    "items": [{"label": "exact label from document", "amount": number}],
    "total_stated": "exact total as written or null"
  }
}`,
  revenue_list: `Extract every client and revenue line from this document.
Return this exact JSON:
{
  "document_type": "revenue_list",
  "company_name": "exact name or null",
  "period": "exact period or null",
  "currency": "currency code or null",
  "clients": [
    {"name": "exact client name", "revenue": number, "percentage": number or null, "contract_type": "exact value or null"}
  ],
  "total_stated": "exact total from document or null"
}`,
  payroll: `Extract every employee and salary line from this document.
Return this exact JSON:
{
  "document_type": "payroll",
  "company_name": "exact name or null",
  "period": "exact period or null",
  "currency": "currency code or null",
  "employees": [
    {"name": "exact name or ID", "role": "exact role or null", "department": "exact dept or null", "gross_salary": number, "net_salary": number or null}
  ],
  "total_gross_stated": "exact total from document or null"
}`
};

function parseJSON(raw) {
  let text = raw.trim();
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(text);
}

export async function extractFinancialData(text, documentType) {
  const prompt = PROMPTS[documentType] || PROMPTS.financial_statement;

  try {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${prompt}\n\nDOCUMENT TEXT:\n${text.slice(0, 12000)}` }
      ],
      temperature: 0,       // ← DETERMINISTIC: same input = same output
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${prompt}\n\nDOCUMENT TEXT:\n${text.slice(0, 12000)}` }
      ],
      temperature: 0,
      max_tokens: 4096,
    });
    return parseJSON(response.choices[0].message.content);
  }
}
