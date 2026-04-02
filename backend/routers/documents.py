from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from database import get_db
from models import User, DocumentLog, DocumentStatus, DocumentType
from schemas import DocumentLogResponse, DocumentListResponse, DashboardResponse, SubscriptionResponse
from routers.auth import get_authenticated_user
from services.pdf_extractor import extract_pdf_text
from services.ai_extractor import extract_financial_data
from services.excel_generator import generate_excel
from services.usage_tracker import can_process_document, increment_usage, get_subscription
from services.billing import report_overage_usage
from config import get_settings
from datetime import datetime
import json, os, tempfile, shutil

router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()

UPLOAD_DIR = "/tmp/datacrunch_uploads"
EXCEL_DIR = "/tmp/datacrunch_excel"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXCEL_DIR, exist_ok=True)


@router.get("/dashboard")
def dashboard(current_user: User = Depends(get_authenticated_user), db: Session = Depends(get_db)):
    sub = get_subscription(db, current_user.organization_id)
    recent_docs = (
        db.query(DocumentLog)
        .filter(DocumentLog.organization_id == current_user.organization_id)
        .order_by(DocumentLog.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "user": current_user,
        "subscription": sub,
        "recent_documents": recent_docs,
    }


@router.post("/upload", response_model=DocumentLogResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: str = Form("financial_statement"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Check usage quota
    usage_check = can_process_document(db, current_user.organization_id)
    if not usage_check["allowed"]:
        raise HTTPException(status_code=402, detail=usage_check["message"])

    # Validate document type
    try:
        doc_type = DocumentType(document_type)
    except ValueError:
        doc_type = DocumentType.other

    # Save uploaded file temporarily
    file_content = await file.read()
    tmp_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{file.filename}")
    with open(tmp_path, "wb") as f:
        f.write(file_content)

    # Create document log entry
    doc_log = DocumentLog(
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        filename=file.filename,
        document_type=doc_type,
        status=DocumentStatus.pending,
        file_size_bytes=len(file_content),
        is_overage=usage_check["is_overage"],
    )
    db.add(doc_log)
    db.commit()
    db.refresh(doc_log)

    # Process in background
    background_tasks.add_task(
        process_document,
        doc_log_id=doc_log.id,
        pdf_path=tmp_path,
        document_type=document_type,
        org_id=current_user.organization_id,
        is_overage=usage_check["is_overage"],
    )

    return doc_log


def process_document(doc_log_id: int, pdf_path: str, document_type: str,
                     org_id: int, is_overage: bool):
    """Background task: extract PDF → AI → Excel → update DB."""
    from database import SessionLocal
    db = SessionLocal()

    doc_log = db.query(DocumentLog).filter(DocumentLog.id == doc_log_id).first()
    if not doc_log:
        return

    try:
        doc_log.status = DocumentStatus.processing
        db.commit()

        # Step 1: Extract PDF text
        pdf_result = extract_pdf_text(pdf_path)
        doc_log.pages_count = pdf_result["pages"]

        # Step 2: AI extraction
        extracted_data = extract_financial_data(pdf_result["text"], document_type)
        doc_log.extracted_data = json.dumps(extracted_data)

        # Step 3: Validation check
        mismatch_found = False
        validation_sections = ["revenue", "expenses", "assets", "liabilities"]
        for section in validation_sections:
            if extracted_data.get(section, {}).get("mismatch"):
                mismatch_found = True
                break
        if extracted_data.get("mismatch"):
            mismatch_found = True

        doc_log.validation_passed = not mismatch_found
        doc_log.validation_notes = extracted_data.get("validation_notes", "")

        # Step 4: Generate Excel
        excel_filename = f"DataCrunch_{doc_log.filename.replace('.pdf', '')}_{doc_log_id}.xlsx"
        excel_path = os.path.join(EXCEL_DIR, excel_filename)
        generate_excel(extracted_data, excel_path)
        doc_log.excel_path = excel_path

        # Step 5: Increment usage
        increment_usage(db, org_id)

        # Step 6: Report overage to Stripe if applicable
        if is_overage:
            org = doc_log.organization
            if org and org.stripe_customer_id:
                try:
                    report_overage_usage(org.stripe_customer_id, quantity=1)
                except Exception:
                    pass  # Don't fail the document if Stripe reporting fails

        doc_log.status = DocumentStatus.completed
        doc_log.completed_at = datetime.utcnow()

    except Exception as e:
        doc_log.status = DocumentStatus.failed
        doc_log.error_message = str(e)

    finally:
        db.commit()
        db.close()
        # Clean up temp PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


@router.get("/{doc_id}/download")
def download_excel(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    doc = db.query(DocumentLog).filter(
        DocumentLog.id == doc_id,
        DocumentLog.organization_id == current_user.organization_id,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != DocumentStatus.completed:
        raise HTTPException(status_code=400, detail=f"Document status: {doc.status}")
    if not doc.excel_path or not os.path.exists(doc.excel_path):
        raise HTTPException(status_code=404, detail="Excel file not found")

    return FileResponse(
        path=doc.excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(doc.excel_path),
    )


@router.get("/{doc_id}/status", response_model=DocumentLogResponse)
def document_status(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    doc = db.query(DocumentLog).filter(
        DocumentLog.id == doc_id,
        DocumentLog.organization_id == current_user.organization_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    query = db.query(DocumentLog).filter(
        DocumentLog.organization_id == current_user.organization_id
    ).order_by(DocumentLog.created_at.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {"total": total, "items": items}
