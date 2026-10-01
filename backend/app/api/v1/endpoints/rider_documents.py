"""Rider identity and vehicle documents: the rider uploads them from the app (after creating the account),
admins verify or reject them. Files are private: served only through these authenticated endpoints."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_rider
from app.core.database import get_db
from app.models.all_models import Rider, RiderDocument, User
from app.services import storage_service as storage
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

rider_router = APIRouter()
admin_router = APIRouter()

DOC_FOLDER = "rider-documents"
MAX_BYTES = 8 * 1024 * 1024
# Stored doc_type → what riders and admins see. The identity types are what the app offers.
DOC_LABELS = {
    "AADHAAR": "Aadhaar Card",
    "PAN": "PAN Card",
    "DRIVING_LICENSE": "Driving Licence",
    "VOTER_ID": "Voter ID",
    "PASSPORT": "Passport",
    "GOVT_ID": "Government ID",
    "VEHICLE_RC": "Vehicle RC",
    "VEHICLE_PROOF": "Vehicle proof / purchase bill",
    "OTHER": "Other document",
}
IDENTITY_TYPES = ("AADHAAR", "PAN", "DRIVING_LICENSE", "VOTER_ID", "PASSPORT", "GOVT_ID")
VEHICLE_TYPES = ("VEHICLE_RC", "VEHICLE_PROOF")


def _sniff(content: bytes) -> Optional[tuple]:
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg", "image/jpeg"
    if content.startswith(b"\x89PNG"):
        return ".png", "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp", "image/webp"
    if content.startswith(b"%PDF"):
        return ".pdf", "application/pdf"
    return None


def doc_dict(d: RiderDocument, file_path: str) -> dict:
    return {
        "id": d.id,
        "doc_type": d.doc_type,
        "label": DOC_LABELS.get(d.doc_type, d.doc_type.replace("_", " ").title()),
        "group": "IDENTITY" if d.doc_type in IDENTITY_TYPES else "VEHICLE" if d.doc_type in VEHICLE_TYPES else "OTHER",
        "file_name": d.file_name,
        "file_path": file_path,  # Authenticated endpoint that returns the file
        "status": d.status,
        "rejection_note": d.rejection_note,
        "created_at": d.created_at,
    }


def _file_response(d: RiderDocument) -> Response:
    try:
        content = storage.read(d.file_url)
    except storage.StorageError:
        raise HTTPException(status_code=503, detail="The document couldn't be loaded just now. Please try again.")
    if content is None:
        raise HTTPException(status_code=404, detail="The document file is missing.")
    kind = (_sniff(content) or (None, "application/octet-stream"))[1]
    return Response(content=content, media_type=kind, headers={"Cache-Control": "private, no-store"})


# ---------------------------------------------------------------------------------------------- Rider

@rider_router.get("/me/documents")
def my_documents(rider: Rider = Depends(get_current_rider)):
    # A vehicle proof replaced by a vehicle change stays on record for admins, but isn't the rider's any more.
    current = [d for d in rider.documents if d.status != "SUPERSEDED"]
    return [doc_dict(d, f"/riders/me/documents/{d.id}/file") for d in sorted(current, key=lambda d: d.id)]


@rider_router.post("/me/documents")
async def upload_my_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    """Uploads (or replaces) one document. A replaced document goes back to Pending review."""
    doc_type = doc_type.strip().upper()
    if doc_type not in DOC_LABELS:
        raise HTTPException(status_code=400, detail="Choose a document type.")
    content = await file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty. Please choose the document again.")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="The file is larger than 8 MB. Please upload a smaller photo or PDF.")
    kind = _sniff(content)
    if not kind:
        raise HTTPException(status_code=400, detail="Upload a photo (JPEG, PNG, WebP) or a PDF of the document.")
    try:
        path = storage.save(content, kind[0], f"{DOC_FOLDER}/{rider.id}", kind[1])
    except storage.StorageError:
        raise HTTPException(status_code=503, detail="The document couldn't be saved just now. Please try again.")
    # One current document per identity group (a new ID replaces the old one) and one vehicle proof.
    group = IDENTITY_TYPES if doc_type in IDENTITY_TYPES else VEHICLE_TYPES if doc_type in VEHICLE_TYPES else (doc_type,)
    old = [d for d in rider.documents if d.doc_type in group]
    for d in old:
        storage.delete(d.file_url)
        db.delete(d)
    doc = RiderDocument(rider_id=rider.id, doc_type=doc_type, file_name=(file.filename or f"{doc_type.lower()}{kind[0]}")[:255],
                        file_url=path, status="PENDING")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    send_notification(db, title=f"Document uploaded: {rider.full_name}",
                      message=f"{rider.full_name} ({rider.rider_id}) uploaded their {DOC_LABELS[doc_type]} for verification.",
                      is_admin=True, category="DOCUMENT", reference_id=str(rider.id))
    return doc_dict(doc, f"/riders/me/documents/{doc.id}/file")


@rider_router.get("/me/documents/{doc_id}/file")
def my_document_file(doc_id: int, rider: Rider = Depends(get_current_rider)):
    d = next((d for d in rider.documents if d.id == doc_id), None)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return _file_response(d)


# ---------------------------------------------------------------------------------------------- Admin

class DocumentReview(BaseModel):
    note: Optional[str] = Field(None, max_length=255)


def _admin_doc(db: Session, rider_id: int, doc_id: int) -> RiderDocument:
    d = db.query(RiderDocument).filter(RiderDocument.id == doc_id, RiderDocument.rider_id == rider_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return d


@admin_router.get("/{rider_id}/documents")
def rider_documents(rider_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    docs = db.query(RiderDocument).filter(RiderDocument.rider_id == rider_id).order_by(RiderDocument.id).all()
    return [doc_dict(d, f"/admin/riders/{rider_id}/documents/{d.id}/file") for d in docs]


@admin_router.get("/{rider_id}/documents/{doc_id}/file")
def rider_document_file(rider_id: int, doc_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return _file_response(_admin_doc(db, rider_id, doc_id))


def _review(db: Session, admin: User, rider_id: int, doc_id: int, status: str, note: Optional[str]) -> dict:
    d = _admin_doc(db, rider_id, doc_id)
    if status == "REJECTED" and not (note or "").strip():
        raise HTTPException(status_code=400, detail="Give a reason so the rider knows what to re-upload.")
    d.status = status
    d.rejection_note = ((note or "").strip() or None) if status == "REJECTED" else None
    db.commit()
    rider = db.get(Rider, rider_id)
    label = DOC_LABELS.get(d.doc_type, d.doc_type)
    log_admin_action(db=db, admin_user=admin, action=f"DOCUMENT_{status}", target_type="RIDER", target_id=str(rider_id),
                     details=f"{label} for {rider.full_name} ({rider.rider_id}) {status.lower()}" + (f": {d.rejection_note}" if d.rejection_note else ""))
    if rider.user_id:
        send_notification(db, user_id=rider.user_id, category="DOCUMENT", reference_id=str(d.id),
                          title=f"{label} {'verified' if status == 'VERIFIED' else 'needs re-upload'}",
                          message=f"Your {label} was verified." if status == "VERIFIED" else f"Please re-upload your {label}. Reason: {d.rejection_note}")
    return doc_dict(d, f"/admin/riders/{rider_id}/documents/{d.id}/file")


@admin_router.post("/{rider_id}/documents/{doc_id}/verify")
def verify_document(rider_id: int, doc_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return _review(db, admin, rider_id, doc_id, "VERIFIED", None)


@admin_router.post("/{rider_id}/documents/{doc_id}/reject")
def reject_document(rider_id: int, doc_id: int, payload: DocumentReview, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return _review(db, admin, rider_id, doc_id, "REJECTED", payload.note)
