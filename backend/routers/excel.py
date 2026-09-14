"""Excel import / preview / export / template + import-undo endpoints.

Writing is deliberately two calls. /preview reads the file and reports what an
import WOULD do; /import does it. The two are bound by a SHA-256 of the
uploaded bytes: preview returns the digest, import requires it back and
recomputes it from what was actually uploaded. So the write always applies to
the file the user reviewed, and an import cannot be fired at the API without
having read the file first. Same idea as bulk-edit's `apply` flag.

That digest also makes a replay recognisable, which matters because nginx cuts
/api off at 120s: a slow import returns 504 to the browser while the backend
keeps going and commits. The user re-uploads, and without this we would run the
whole thing a second time.
"""
import hashlib
import json
import uuid
from datetime import datetime, timedelta
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, ImportBatch, DateChangeHistory,
)
from auth import get_current_user, get_current_full_internal_user
from excel_utils import (
    import_excel_to_database, export_database_to_excel, MAX_UPLOAD_BYTES,
)
from import_revert import revert_field, UnrevertableField
from realtime import manager


router = APIRouter()

# A re-upload of identical bytes inside this window is treated as a retry of
# the same intent rather than a second, deliberate import. Comfortably longer
# than nginx's 120s timeout, short enough that a genuine "import the same file
# again tomorrow" is unaffected.
REPLAY_WINDOW = timedelta(minutes=30)


def _digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _reject_oversize(content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"That file is {len(content) / 1024 / 1024:.1f}MB. The limit is "
                   f"{MAX_UPLOAD_BYTES // 1024 // 1024}MB — a spreadsheet this large is "
                   f"usually carrying embedded images or thousands of blank rows.")


@router.post("/api/excel/preview")
async def preview_excel_import(
    file: UploadFile = File(...),
    new_only: bool = Form(False),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Preview what an Excel import will do without committing changes"""
    if not file.filename.endswith(('.xlsx', '.xlsm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .xlsx or .xlsm format"
        )

    content = await file.read()
    _reject_oversize(content)

    from excel_utils import preview_excel_import as do_preview
    result = do_preview(content, db, new_only=new_only)
    # The token /import requires back. Ties the write to this exact file.
    result["file_digest"] = _digest(content)
    return result


@router.post("/api/excel/import")
async def import_excel(
    file: UploadFile = File(...),
    conflict_resolutions: Optional[str] = Form(None),
    new_only: bool = Form(False),
    confirm_digest: Optional[str] = Form(None),
    force: bool = Form(False),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Import purchase orders from Excel file.

    Requires `confirm_digest` — the `file_digest` /preview returned for this
    same file. `force=true` overrides only the replay check, never the digest.
    """
    if not file.filename.endswith(('.xlsx', '.xlsm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .xlsx or .xlsm format"
        )

    content = await file.read()
    _reject_oversize(content)
    digest = _digest(content)

    # The gate. An import with no preview behind it, or one whose file changed
    # after the preview, is refused rather than written.
    if not confirm_digest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This import was not confirmed against a preview. Preview the file "
                   "first, then import — that is what shows you the changes before they land.")
    if confirm_digest != digest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file does not match the one that was previewed. Re-run the preview "
                   "so you are approving the changes in the file you are actually importing.")

    # Replay check. Identical bytes, already imported, still standing.
    if not force:
        recent = db.query(ImportBatch).filter(
            ImportBatch.file_digest == digest,
            ImportBatch.is_undone == False,
            ImportBatch.created_at >= datetime.utcnow() - REPLAY_WINDOW,
        ).order_by(ImportBatch.created_at.desc()).first()
        if recent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This exact file was already imported by {recent.username} at "
                       f"{recent.created_at:%H:%M} ({recent.rows_created} created, "
                       f"{recent.rows_updated} updated). If the page timed out, the import "
                       f"still finished — check the orders before importing it again.")

    resolutions = []
    if conflict_resolutions:
        try:
            resolutions = json.loads(conflict_resolutions)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid conflict resolutions format"
            )

    batch_id = str(uuid.uuid4())

    result = import_excel_to_database(
        content, db, current_user,
        import_batch_id=batch_id,
        conflict_resolutions=resolutions if resolutions else None,
        new_only=new_only,
    )

    if result.rows_created > 0 or result.rows_updated > 0:
        batch = ImportBatch(
            batch_id=batch_id,
            user_id=current_user.id,
            username=current_user.username,
            filename=file.filename,
            rows_created=result.rows_created,
            rows_updated=result.rows_updated,
            file_digest=digest,
        )
        db.add(batch)
        db.commit()

    await manager.broadcast({
        "type": "bulk_import",
        "data": {
            "rows_created": result.rows_created,
            "rows_updated": result.rows_updated,
            "username": current_user.username
        },
        "timestamp": datetime.utcnow().isoformat()
    })

    return {
        "success": result.success,
        "rows_processed": result.rows_processed,
        "rows_created": result.rows_created,
        "rows_updated": result.rows_updated,
        "errors": result.errors,
        "batch_id": batch_id if (result.rows_created > 0 or result.rows_updated > 0) else None,
    }


@router.get("/api/excel/export")
async def export_excel(
    po_number: str = None,
    po_numbers: Optional[List[str]] = Query(None),  # multi-select from export modal
    order_ids: Optional[List[int]] = Query(None),   # explicit row selection from the V2 bulk bar
    style_code: str = None,
    factory: str = None,
    customer: str = None,
    status: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export purchase orders to Excel file"""
    try:
        role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
        is_supplier = role_str == 'supplier'

        filters = {}
        if po_number:
            filters['po_number'] = po_number
        if po_numbers:
            filters['po_numbers'] = po_numbers
        if order_ids:
            filters['order_ids'] = order_ids
        if style_code:
            filters['style_code'] = style_code
        if factory:
            filters['factory'] = factory
        if customer:
            filters['customer'] = customer
        if status:
            filters['status'] = status

        factory_filter = current_user.factory_name if is_supplier else None

        excel_file = export_database_to_excel(
            db,
            factory_filter=factory_filter,
            is_supplier=is_supplier,
            filters=filters if filters else None
        )

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        suffix = "_filtered" if filters else ""
        filename = f"orderbook_export{suffix}_{timestamp}.xlsx"

        return StreamingResponse(
            excel_file,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Export failed. Please try again or contact an administrator."
        )


@router.get("/api/excel/template")
async def download_template(current_user: User = Depends(get_current_full_internal_user)):
    """Download an empty Excel template for imports"""
    import openpyxl
    from openpyxl.styles import Font, PatternFill

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    headers = [
        "PO#", "SYSTEM PO#", "ACTIVE", "CUSTOMER", "China Orderbook Reference",
        "CUSTOMER PO#", "SEASON", "FACTORY", "TERMS", "SALES PERSON", "STYLE CODE",
        "CUSTOMER STYLE CODE", "DESCRIPTION", "COLOUR", "GENDER", "TOTAL",
        "TRADE PRICE", "TOTAL ORDER VALUE", "ORDER RECEIVED DATE",
        "ORDER SENT TO FACTORY DATE", "ORIGINAL PO EX-FACTORY",
        "DATE APPROVED TO PRODUCTION", "REVISED PO EX-FACTORY",
        "ORIGINAL DEL DATE TO CUSTOMER", "CUSTOMER PO OPEN MONTH",
        "EXPECTED DISPATCH ARRIVE TO UK MONTH", "ETA TO UK",
        "ACTUAL DATE DEL TO UK", "ETA TO CUSTOMER", "ACTUAL DATE DEL TO CUSTOMER"
    ]

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(1, col_idx, header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=orderbook_template.xlsx"}
    )


@router.get("/api/excel/last-import")
async def get_last_import(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get the most recent import batch info (for showing undo button)"""
    batch = db.query(ImportBatch).filter(
        ImportBatch.is_undone == False
    ).order_by(ImportBatch.created_at.desc()).first()

    if not batch:
        return {"batch": None}

    return {
        "batch": {
            "batch_id": batch.batch_id,
            "username": batch.username,
            "filename": batch.filename,
            "rows_created": batch.rows_created,
            "rows_updated": batch.rows_updated,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
        }
    }


@router.post("/api/excel/undo")
async def undo_last_import(
    batch_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Undo an Excel import.

    `batch_id` names the import the caller believes they are undoing — the one
    the page is showing them. It has to still be the most recent undoable
    batch, or the request is refused: without that check, someone else
    importing between the page load and the click means you silently revert
    their work instead of the batch you were looking at.
    """
    batch = db.query(ImportBatch).filter(
        ImportBatch.is_undone == False
    ).order_by(ImportBatch.created_at.desc()).first()

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No import found to undo"
        )

    if batch_id and batch_id != batch.batch_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"There has been another import since this page loaded — "
                   f"{batch.username} imported {batch.filename or 'a file'} at "
                   f"{batch.created_at:%H:%M} ({batch.rows_created} created, "
                   f"{batch.rows_updated} updated). Undo reverts the most recent import, "
                   f"so refresh and check that is the one you meant.")

    batch_id = batch.batch_id
    orders_deleted = 0
    orders_reverted = 0

    # 1. Delete all PurchaseOrders created by this import
    new_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.import_batch_id == batch_id
    ).all()

    for order in new_orders:
        db.delete(order)
        orders_deleted += 1

    # 2. Revert all field changes from this import using DateChangeHistory
    history_entries = db.query(DateChangeHistory).filter(
        DateChangeHistory.import_batch_id == batch_id
    ).all()

    # Cache the orders so a batch touching one row across twenty fields does
    # one query rather than twenty.
    po_cache = {}
    reverted_po_ids = set()
    skipped_fields = []

    for entry in history_entries:
        po = po_cache.get(entry.po_id)
        if po is None and entry.po_id not in po_cache:
            po = db.query(PurchaseOrder).filter(PurchaseOrder.id == entry.po_id).first()
            po_cache[entry.po_id] = po

        if po:
            # Coerced against the column's real type rather than a hand-kept
            # list of field names. The old lists missed 18 date columns and
            # is_active, and a miss aborted the entire undo at commit time —
            # see import_revert for the full account.
            try:
                revert_field(po, entry.field_name, entry.old_value)
            except UnrevertableField:
                # A history row naming something that is not a writable column.
                # Skip that one field; reverting the other 60 is still worth
                # far more than failing the whole undo.
                skipped_fields.append(entry.field_name)
                # Deliberately not deleted: the history row stays as evidence
                # of the one field the undo could not put back.
                continue
            po.updated_at = datetime.utcnow()
            reverted_po_ids.add(entry.po_id)

        db.delete(entry)

    orders_reverted = len(reverted_po_ids)

    batch.is_undone = True

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to undo import: {str(e)}"
        )

    return {
        "success": True,
        "orders_deleted": orders_deleted,
        "orders_reverted": orders_reverted,
        "batch_id": batch_id,
        # Empty in normal operation. Non-empty means a history row named
        # something that is no longer a column, and the UI should say so
        # rather than report a clean undo.
        "skipped_fields": sorted(set(skipped_fields)),
    }
