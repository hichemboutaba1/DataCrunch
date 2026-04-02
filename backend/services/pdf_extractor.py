import fitz  # PyMuPDF
import pdfplumber
from pathlib import Path


def extract_text_pymupdf(pdf_path: str) -> dict:
    """
    Primary extractor using PyMuPDF.
    Returns: { "text": str, "pages": int, "method": "pymupdf" }
    """
    doc = fitz.open(pdf_path)
    pages_text = []

    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text")
        pages_text.append(f"--- PAGE {page_num} ---\n{text}")

    doc.close()
    full_text = "\n".join(pages_text)

    return {
        "text": full_text,
        "pages": len(pages_text),
        "method": "pymupdf"
    }


def extract_text_pdfplumber(pdf_path: str) -> dict:
    """
    Fallback extractor using pdfplumber (better for tables).
    Returns: { "text": str, "pages": int, "method": "pdfplumber" }
    """
    pages_text = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""

            # Also extract tables if present
            tables = page.extract_tables()
            table_text = ""
            for table in tables:
                for row in table:
                    if row:
                        table_text += " | ".join([str(cell or "") for cell in row]) + "\n"

            pages_text.append(f"--- PAGE {page_num} ---\n{text}\n{table_text}")

    return {
        "text": "\n".join(pages_text),
        "pages": len(pages_text),
        "method": "pdfplumber"
    }


def extract_pdf_text(pdf_path: str) -> dict:
    """
    Tries PyMuPDF first. Falls back to pdfplumber if result is too short.
    """
    result = extract_text_pymupdf(pdf_path)

    # If extracted text is too sparse, try pdfplumber
    if len(result["text"].strip()) < 100:
        result = extract_text_pdfplumber(pdf_path)

    return result
