from groq import Groq
import json
from config import get_settings

settings = get_settings()
client = Groq(api_key=settings.GROQ_API_KEY)

SYSTEM_PROMPT = """You are a financial data extraction specialist for M&A due diligence.
Your job is to extract structured financial data from document text and return ONLY valid JSON.

CRITICAL RULES:
- Return ONLY valid JSON. No explanations, no markdown.
- ALL values must be actual numbers. NEVER write arithmetic expressions like "100 + 200".
- For total_calculated, compute the sum yourself and write the final number (e.g. 300, not "100 + 200").
- Every value in the JSON must be a string, number, boolean, null, array or object. No formulas."""

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


import re


def _fix_arithmetic_in_json(text: str) -> str:
    """Replace arithmetic expressions like '50328 + 7765 + 1656' with computed values."""
    def eval_match(match):
        try:
            return str(int(eval(match.group(0))))
        except Exception:
            return match.group(0)
    # Match sequences of numbers joined by + (with optional spaces)
    return re.sub(r'\d+(?:\s*\+\s*\d+)+', eval_match, text)


def _extract_json(raw: str) -> dict:
    """Parse JSON from AI response, handling code blocks and arithmetic expressions."""
    # Strip markdown code blocks
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    # Fix arithmetic expressions before parsing
    raw = _fix_arithmetic_in_json(raw)
    return json.loads(raw)


def extract_financial_data(text: str, document_type: str) -> dict:
    """
    Sends PDF text to Groq (Llama 3) and returns structured JSON.
    """
    prompt_template = EXTRACTION_PROMPTS.get(document_type, EXTRACTION_PROMPTS["financial_statement"])

    try:
        # Try with JSON mode first
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
        return json.loads(response.choices[0].message.content.strip())
    except Exception:
        pass

    # Fallback: no JSON mode, fix expressions manually
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{prompt_template}\n\nDOCUMENT TEXT:\n{text[:12000]}"}
        ],
        temperature=0.1,
        max_tokens=4096,
    )

    raw_response = response.choices[0].message.content.strip()
    return _extract_json(raw_response)
