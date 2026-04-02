import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a financial data extraction specialist for M&A due diligence.
Return ONLY valid JSON. No explanations, no markdown.
ALL numeric values must be actual computed numbers, never arithmetic expressions like "100 + 200".`;

const PROMPTS = {
  financial_statement: `Extract financial data and return this exact JSON:
{
  "document_type": "financial_statement",
  "company_name": "string or null",
  "period": "string or null",
  "currency": "string or null",
  "revenue": { "items": [{"label": "string", "amount": number}], "total_stated": number, "total_calculated": number, "mismatch": boolean },
  "expenses": { "items": [{"label": "string", "amount": number}], "total_stated": null, "total_calculated": number, "mismatch": false },
  "ebitda": number or null,
  "net_income": number or null,
  "assets": { "items": [{"label": "string", "amount": number}], "total_stated": number, "total_calculated": number, "mismatch": boolean },
  "liabilities": { "items": [{"label": "string", "amount": number}], "total_stated": number, "total_calculated": number, "mismatch": boolean },
  "validation_notes": "string"
}`,
  revenue_list: `Extract revenue/client data and return this exact JSON:
{
  "document_type": "revenue_list",
  "company_name": "string or null",
  "period": "string or null",
  "currency": "string or null",
  "clients": [{"name": "string", "revenue": number, "percentage": number, "contract_type": "string"}],
  "total_stated": number,
  "total_calculated": number,
  "mismatch": boolean,
  "validation_notes": "string"
}`,
  payroll: `Extract payroll data and return this exact JSON:
{
  "document_type": "payroll",
  "company_name": "string or null",
  "period": "string or null",
  "currency": "string or null",
  "employees": [{"name": "string", "role": "string", "department": "string", "gross_salary": number, "net_salary": number}],
  "total_gross_stated": number,
  "total_gross_calculated": number,
  "headcount": number,
  "mismatch": boolean,
  "validation_notes": "string"
}`
};

function fixArithmetic(text) {
  return text.replace(/\d+(?:\s*\+\s*\d+)+/g, (match) => {
    try { return String(eval(match)); } catch { return match; }
  });
}

function parseJSON(raw) {
  let text = raw.trim();
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  text = fixArithmetic(text);
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
      temperature: 0.1,
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
      temperature: 0.1,
      max_tokens: 4096,
    });
    return parseJSON(response.choices[0].message.content);
  }
}
