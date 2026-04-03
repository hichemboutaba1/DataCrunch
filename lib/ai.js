import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a financial data extraction specialist for M&A due diligence.
Your ONLY job is to extract numbers EXACTLY as written in the document.

CRITICAL NUMBER FORMATTING RULES:
- Numbers may use spaces, dots, or commas as thousands separators. ALWAYS output the full plain integer.
  Examples: "39 299 894" → 39299894 | "39.299.894" → 39299894 | "39,299,894" → 39299894
- NEVER truncate or shorten numbers. "39 299 894" is thirty-nine MILLION, not 392994.
- If a value is in thousands (e.g. document says "in thousands"), multiply each number by 1000.
- Decimal separators: "392,998.50" → 392998.5 | "392.998,50" → 392998.5
- Numbers that appear as "39299894" after preprocessing had spaces removed (e.g. "39 299 894" = 39,299,894).
- Table rows may appear as "Label  |  Amount" — extract the label and the amount separately.
- ALL numeric values must be plain integers or decimals (e.g. 39299894), NEVER strings or expressions.
- If a value is not present in the document, use null — do NOT guess.
- Do NOT calculate any totals yourself — only extract stated totals from the document.
- Extract line item labels EXACTLY as they appear in the document.
- Return ONLY valid JSON. No markdown, no comments, no explanations.`;

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
  payroll: `Extract every person/employee entry and their salary from this document.
This could be a payroll list, staff list, salary schedule, HR report, or any document listing people with compensation.
Look for: employee names OR IDs, salaries OR wages OR compensation, roles OR job titles, departments.
Even if the format is unusual (e.g. a table with columns in different order), extract every row.
Return this exact JSON:
{
  "document_type": "payroll",
  "company_name": "company name from document or null",
  "period": "period/date from document or null",
  "currency": "currency code (EUR/USD/GBP etc) or null",
  "employees": [
    {
      "name": "person name or employee ID (use whatever identifier is present)",
      "role": "job title or role or null",
      "department": "department or team or null",
      "gross_salary": number (gross/brut salary — use 0 if only net is available),
      "net_salary": number or null
    }
  ],
  "total_gross_stated": total gross salary as stated in document or null
}
IMPORTANT: Extract EVERY row/person you can find. If a column is missing (e.g. no department), use null.
If the document shows "Salaire brut" use that as gross_salary. If "Salaire net" use as net_salary.`
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
