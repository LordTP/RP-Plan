"""Excel import / preview / export / template + import-undo endpoints."""
import json
import uuid
from datetime import datetime
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, ImportBatch, DateChangeHistory,
)
from auth import get_current_user, get_current_full_internal_user
from excel_utils import import_excel_to_database, export_database_to_excel
from realtime import manager


router = APIRouter()


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
    from excel_utils import preview_excel_import as do_preview
    result = do_preview(content, db, new_only=new_only)
    return result


@router.post("/api/excel/import")
async def import_excel(
    file: UploadFile = File(...),
    conflict_resolutions: Optional[str] = Form(None),
    new_only: bool = Form(False),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Import purchase orders from Excel file"""
    if not file.filename.endswith(('.xlsx', '.xlsm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .xlsx or .xlsm format"
        )

    content = await file.read()

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
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Undo the most recent Excel import"""
    batch = db.query(ImportBatch).filter(
        ImportBatch.is_undone == False
    ).order_by(ImportBatch.created_at.desc()).first()

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No import found to undo"
        )

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

    reverted_po_ids = set()
    for entry in history_entries:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == entry.po_id).first()
        if po:
            field_name = entry.field_name
            old_value_str = entry.old_value

            if old_value_str is None:
                setattr(po, field_name, None)
            elif field_name in ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
                                'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
                                'size_11', 'size_12', 'size_13', 'size_14',
                                'total_quantity']:
                try:
                    setattr(po, field_name, int(float(old_value_str)))
                except (ValueError, TypeError):
                    setattr(po, field_name, None)
            elif field_name in ['trade_price', 'total_order_value']:
                try:
                    setattr(po, field_name, float(old_value_str))
                except (ValueError, TypeError):
                    setattr(po, field_name, None)
            elif field_name in ['order_received_date', 'order_sent_to_factory_date',
                                'original_po_ex_factory', 'date_approved_to_production',
                                'revised_po_ex_factory', 'original_del_date_to_customer',
                                'eta_to_uk', 'actual_date_del_to_uk',
                                'eta_to_customer', 'actual_date_del_to_customer']:
                from excel_utils import parse_date
                setattr(po, field_name, parse_date(old_value_str))
            else:
                setattr(po, field_name, old_value_str)

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
    }
