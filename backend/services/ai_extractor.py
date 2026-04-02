from groq import Groq
import json
from config import get_settings

settings = get_settings()
client = Groq(api_key=settings.GROQ_API_KEY)

SYSTEM_PROMPT = """You are a financial data extraction specialist for M&A due diligence.
Your job is to extract structured financial data from document text and return ONLY valid JSON.
Never include explanations, markdown, or any text outside the JSON object.
Always calculate totals yourself and compare to stated totals."""

EXTRACTION_PROMPTS = {
    "financial_statement": """
Extract ALL financial data from this document and return this exact JSON structure:
{
  "document_type": "financial_statement",
  "company_name": "string or null",
  "period": "string (e.g. FY2023, Q1 2024) or null",
  "currency": "string (e.g. EUR, USD) or null",
  "revenue": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number or null,
    "total_calculated": number,
    "mismatch": boolean
  },
  "expenses": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number or null,
    "total_calculated": number,
    "mismatch": boolean
  },
  "ebitda": number or null,
  "net_income": number or null,
  "assets": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number or null,
    "total_calculated": number,
    "mismatch": boolean
  },
  "liabilities": {
    "items": [{"label": "string", "amount": number}],
    "total_stated": number or null,
    "total_calculated": number,
    "mismatch": boolean
  },
  "validation_notes": "string describing any mismatches found"
}
""",
    "revenue_list": """
Extract ALL revenue/client data from this document and return this exact JSON structure:
{
  "document_type": "revenue_list",
  "company_name": "string or null",
  "period": "string or null",
  "currency": "string or null",
  "clients": [
    {
      "name": "string",
      "revenue": number,
      "percentage": number or null,
      "contract_type": "string or null"
    }
  ],
  "total_stated": number or null,
  "total_calculated": number,
  "mismatch": boolean,
  "top_client_concentration": number,
  "validation_notes": "string"
}
""",
    "payroll": """
Extract ALL payroll data from this document and return this exact JSON structure:
{
  "document_type": "payroll",
  "company_name": "string or null",
  "period": "string or null",
  "currency": "string or null",
  "employees": [
    {
      "name": "string or anonymized ID",
      "role": "string or null",
      "department": "string or null",
      "gross_salary": number,
      "net_salary": number or null,
      "social_charges": number or null
    }
  ],
  "total_gross_stated": number or null,
  "total_gross_calculated": number,
  "total_net_calculated": number or null,
  "headcount": number,
  "mismatch": boolean,
  "validation_notes": "string"
}
"""
}


def extract_financial_data(text: str, document_type: str) -> dict:
    """
    Sends PDF text to Groq (Llama 3) and returns structured JSON.
    """
    prompt_template = EXTRACTION_PROMPTS.get(document_type, EXTRACTION_PROMPTS["financial_statement"])

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{prompt_template}\n\nDOCUMENT TEXT:\n{text[:12000]}"}
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    raw_response = response.choices[0].message.content.strip()

    # Parse JSON — strip markdown code blocks if present
    try:
        data = json.loads(raw_response)
    except json.JSONDecodeError:
        if "```json" in raw_response:
            json_str = raw_response.split("```json")[1].split("```")[0].strip()
            data = json.loads(json_str)
        elif "```" in raw_response:
            json_str = raw_response.split("```")[1].split("```")[0].strip()
            data = json.loads(json_str)
        else:
            raise ValueError(f"AI returned invalid JSON: {raw_response[:200]}")

    return data
