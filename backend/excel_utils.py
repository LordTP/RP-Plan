"""
Excel import/export utilities
Matches the exact format of CP_-_Thomas_Enhanced.xlsm Sheet1
"""
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from io import BytesIO
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import PurchaseOrder, User, DateChangeHistory, PendingDateChange
from schemas import ExcelUploadResponse


# =============================================================================
# COLUMN MAPPING - Matches CP_-_Thomas_Enhanced.xlsm Sheet1 exactly
# =============================================================================

# Sheet1 column structure - matches exact format
# Format: (header_name, db_field, data_type, is_internal_only)
SHEET1_COLUMNS = [
    ("PO#", "po_number", "text", False),
    ("SYSTEM PO#", "system_po_number", "text", True),  # Red - internal only
    ("ACTIVE", "is_active", "bool", True),  # Red - internal only
    ("CUSTOMER", "customer", "text", False),
    ("China Orderbook Reference", "china_orderbook_ref", "text", False),
    ("CUSTOMER PO#", "customer_po_number", "text", False),
    ("SEASON", "season", "text", False),
    ("FACTORY", "factory", "text", False),
    ("TERMS", "terms", "text", False),
    ("SALES PERSON", "sales_person", "text", False),
    ("STYLE CODE", "style_code", "text", False),
    ("CUSTOMER STYLE CODE", "customer_style_code", "text", False),
    ("DESCRIPTION", "description", "text", False),
    ("COLOUR", "colour", "text", False),
    ("GENDER", "gender", "text", False),
    # Size columns - these get a merged header "SIZE RANGE & QTY" in row 1
    ("2XS", "size_2xs", "int", False),
    ("XS", "size_xs", "int", False),
    ("S", "size_s", "int", False),
    ("M", "size_m", "int", False),
    ("L", "size_l", "int", False),
    ("XL", "size_xl", "int", False),
    ("2XL", "size_2xl", "int", False),
    ("3XL", "size_3xl", "int", False),
    ("4XL", "size_4xl", "int", False),
    ("5XL", "size_5xl", "int", False),
    # Continue after sizes
    ("TOTAL", "total_quantity", "int", False),
    ("TRADE PRICE (Change to cost proce $)", "trade_price", "float", False),
    ("TOTAL ORDER VALUE", "total_order_value", "float", False),
    ("ORDER RECEIVED DATE", "order_received_date", "date", True),  # Red - internal only
    ("ORDER SENT TO FACTORY DATE", "order_sent_to_factory_date", "date", False),
    ("ORIGINAL PO EX-FACTORY", "original_po_ex_factory", "date", False),
    ("DATE APPROVED TO PRODUCTION", "date_approved_to_production", "date", False),
    ("REVISED PO EX-FACTORY", "revised_po_ex_factory", "date", False),
    ("ORIGINAL DEL DATE TO CUSTOMER", "original_del_date_to_customer", "date", False),
    ("CUSTOMER PO OPEN MONTH", "customer_po_open_month", "text", False),
    ("EXPECTED DISPATCH ARRIVE TO UK MONTH", "expected_dispatch_arrive_uk_month", "text", False),
    ("ETA TO UK", "eta_to_uk", "date", False),
    ("ACTUAL DATE DEL TO UK (scheduling)", "actual_date_del_to_uk", "date", False),
    ("ETA TO CUSTOMER", "eta_to_customer", "date", False),
    ("ACTUAL DATE DEL TO CUSTOMER", "actual_date_del_to_customer", "date", False),
    # COMMENTS column is NOT exported - managed separately in the app
    ("LATE", "status", "text", False),
]


def parse_date(value: Any) -> Optional[datetime]:
    """Parse various date formats from Excel"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        value = value.strip()
        if not value or value.lower() in ['none', 'n/a', '-', '']:
            return None
        # Try common date formats
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S"]:
            try:
                return datetime.strptime(value, fmt)
            except:
                continue
    return None


def parse_bool(value: Any, default: bool = True) -> bool:
    """Parse boolean values from Excel"""
    if value is None:
        return default
    val_str = str(value).upper().strip()
    if val_str in ["YES", "TRUE", "1", "Y", "ACTIVE"]:
        return True
    if val_str in ["NO", "FALSE", "0", "N", "INACTIVE"]:
        return False
    return default


def parse_int(value: Any) -> Optional[int]:
    """Parse integer values from Excel"""
    if value is None:
        return None
    try:
        return int(float(value))
    except:
        return None


def parse_float(value: Any) -> Optional[float]:
    """Parse float values from Excel"""
    if value is None:
        return None
    try:
        # Handle currency formatted strings
        if isinstance(value, str):
            value = value.replace('$', '').replace('£', '').replace(',', '').strip()
        return float(value)
    except:
        return None


def format_date(value: Any) -> Optional[str]:
    """Format date for Excel export"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    return str(value)


# =============================================================================
# IMPORT FUNCTIONS
# =============================================================================

def import_excel_to_database(file_bytes: bytes, db: Session, user: User, import_batch_id: str = None, conflict_resolutions: List[Dict[str, Any]] = None) -> ExcelUploadResponse:
    """
    Import POs from Excel file into database.

    Key logic:
    - Uses PO# + Style Code as unique identifier for each row
    - New rows (unique PO# + Style Code combinations) are added
    - Existing rows are checked for changes and updated if needed
    - Comments are NOT affected by import (managed separately)

    Validation:
    - PO# is required
    - Style Code is required
    - Skips empty/header/reference rows
    """
    try:
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
    except openpyxl.utils.exceptions.InvalidFileException:
        return ExcelUploadResponse(
            success=False,
            rows_processed=0,
            rows_created=0,
            rows_updated=0,
            errors=["Invalid Excel file format. Please upload a valid .xlsx or .xlsm file. If you have an older .xls file, please save it as .xlsx first."]
        )
    except Exception as e:
        error_msg = str(e).lower()
        if "password" in error_msg or "encrypted" in error_msg:
            return ExcelUploadResponse(
                success=False,
                rows_processed=0,
                rows_created=0,
                rows_updated=0,
                errors=["This Excel file appears to be password protected. Please remove the password protection and try again."]
            )
        elif "corrupt" in error_msg or "damaged" in error_msg:
            return ExcelUploadResponse(
                success=False,
                rows_processed=0,
                rows_created=0,
                rows_updated=0,
                errors=["This Excel file appears to be corrupted or damaged. Please try exporting it again from Excel."]
            )
        return ExcelUploadResponse(
            success=False,
            rows_processed=0,
            rows_created=0,
            rows_updated=0,
            errors=[f"Could not open the Excel file: {str(e)}. Please ensure it's a valid .xlsx or .xlsm file and not password protected."]
        )

    # Use first sheet (Sheet1 - internal view with all data)
    if len(wb.worksheets) == 0:
        return ExcelUploadResponse(
            success=False,
            rows_processed=0,
            rows_created=0,
            rows_updated=0,
            errors=["The Excel file has no worksheets. Please ensure the file contains data in at least one sheet."]
        )

    sheet = wb.worksheets[0]

    rows_processed = 0
    rows_created = 0
    rows_updated = 0
    rows_skipped = 0
    errors = []

    # Build resolution lookup for pending date change conflicts
    resolution_map = {}
    if conflict_resolutions:
        for cr in conflict_resolutions:
            resolution_map[cr["pending_change_id"]] = cr["resolution"]

    # Fields that can have pending supplier approvals
    SUPPLIER_DATE_FIELDS = {'date_approved_to_production', 'revised_po_ex_factory', 'actual_date_del_to_uk'}

    # Build column mapping from headers
    col_map = _build_column_map(sheet)

    if "po_number" not in col_map:
        return ExcelUploadResponse(
            success=False,
            rows_processed=0,
            rows_created=0,
            rows_updated=0,
            errors=["Missing required column: 'PO#'. The file must have a column header named 'PO#' in the first row. Please check your file matches the template format."]
        )

    if "style_code" not in col_map:
        return ExcelUploadResponse(
            success=False,
            rows_processed=0,
            rows_created=0,
            rows_updated=0,
            errors=["Missing required column: 'STYLE CODE'. The file must have a column header named 'STYLE CODE' in the first row. Please check your file matches the template format."]
        )

    # Find first data row (skip header rows and size reference rows)
    start_row = _find_data_start_row(sheet, col_map)

    for row_idx in range(start_row, sheet.max_row + 1):
        try:
            # Get PO# and Style Code
            po_number = _get_cell_str(sheet, row_idx, col_map.get("po_number"))
            style_code = _get_cell_str(sheet, row_idx, col_map.get("style_code"))

            # Skip rows without PO# or Style Code
            if not po_number or po_number.upper() in ['INPUT', 'NONE', 'PO#', '']:
                rows_skipped += 1
                continue

            if not style_code or style_code.upper() in ['INPUT', 'NONE', 'STYLE CODE', '']:
                rows_skipped += 1
                continue

            rows_processed += 1

            # Check if this PO# + Style Code combination exists
            existing_po = db.query(PurchaseOrder).filter(
                and_(
                    PurchaseOrder.po_number == po_number,
                    PurchaseOrder.style_code == style_code
                )
            ).first()

            # Build data dictionary from row
            po_data = _extract_row_data(sheet, row_idx, col_map)

            if existing_po:
                # Fields that should NEVER be overwritten during import
                # These are managed in the app and should be preserved
                protected_fields = [
                    'po_number', 'style_code',  # Key fields
                    'status',  # Status is set manually in the app
                    'is_late',  # Calculated/set in the app
                ]

                # Check if any fields have changed
                changed_fields = []
                for field, new_value in po_data.items():
                    # Skip protected fields
                    if field in protected_fields:
                        continue

                    old_value = getattr(existing_po, field, None)

                    # Don't overwrite existing data with None/empty values
                    # Only update if new value is meaningful
                    if new_value is None or new_value == '':
                        continue

                    # Compare values (handle None/empty equivalence)
                    if _values_different(old_value, new_value):
                        # Check for pending date change conflict
                        if field in SUPPLIER_DATE_FIELDS:
                            pending = db.query(PendingDateChange).filter(
                                PendingDateChange.order_id == existing_po.id,
                                PendingDateChange.field_name == field,
                                PendingDateChange.status == "pending"
                            ).first()
                            if pending:
                                resolution = resolution_map.get(pending.id)
                                if resolution == "use_pending":
                                    # Approve the pending change, use supplier's proposed value
                                    pending_value = parse_date(pending.proposed_value)
                                    setattr(existing_po, field, pending_value)
                                    pending.status = "approved"
                                    pending.reviewed_by_id = user.id
                                    pending.reviewed_by_username = user.username
                                    pending.reviewed_at = datetime.utcnow()
                                    db.add(DateChangeHistory(
                                        po_id=existing_po.id,
                                        user_id=user.id,
                                        field_name=field,
                                        old_value=str(old_value) if old_value is not None else None,
                                        new_value=pending.proposed_value,
                                        source="Supplier (Approved)",
                                        approved_by_id=user.id,
                                        approved_by_username=user.username,
                                        import_batch_id=import_batch_id
                                    ))
                                    changed_fields.append(field)
                                    continue
                                elif resolution == "use_excel":
                                    # Reject the pending change, fall through to use Excel value
                                    pending.status = "rejected"
                                    pending.reviewed_by_id = user.id
                                    pending.reviewed_by_username = user.username
                                    pending.reviewed_at = datetime.utcnow()
                                    pending.rejection_reason = f"Excel import override confirmed by {user.username}"
                                    db.add(DateChangeHistory(
                                        po_id=existing_po.id,
                                        user_id=user.id,
                                        field_name=field,
                                        old_value=pending.current_value,
                                        new_value=pending.proposed_value,
                                        source="Supplier (Rejected)",
                                        approved_by_id=user.id,
                                        approved_by_username=user.username,
                                        rejection_reason=f"Excel import override confirmed by {user.username}",
                                    ))
                                    # Fall through to normal Excel update below
                                else:
                                    # No resolution provided — skip this field
                                    continue

                        changed_fields.append(field)

                        # Track change in history
                        old_value_str = str(old_value) if old_value is not None else None
                        new_value_str = str(new_value) if new_value is not None else None

                        history_entry = DateChangeHistory(
                            po_id=existing_po.id,
                            user_id=user.id,
                            field_name=field,
                            old_value=old_value_str,
                            new_value=new_value_str,
                            source="Excel Import",
                            import_batch_id=import_batch_id
                        )
                        db.add(history_entry)

                        setattr(existing_po, field, new_value)

                if changed_fields:
                    # Auto-calculate totals
                    _calculate_order_totals(existing_po)
                    existing_po.updated_at = datetime.utcnow()
                    rows_updated += 1
                    print(f"  Updated PO# {po_number} / {style_code}: {changed_fields}")
            else:
                # Create new PO
                new_po = PurchaseOrder(**po_data)
                if import_batch_id:
                    new_po.import_batch_id = import_batch_id
                # Auto-calculate totals
                _calculate_order_totals(new_po)
                db.add(new_po)
                rows_created += 1
                print(f"  Created PO# {po_number} / {style_code}")

        except Exception as e:
            error_str = str(e).lower()
            po_info = f"PO# {po_number}" if po_number else f"Row {row_idx}"
            style_info = f" / Style: {style_code}" if style_code else ""

            if "data type" in error_str or "invalid" in error_str:
                errors.append(f"{po_info}{style_info}: Invalid data format - please check numbers and dates are in correct format")
            elif "null" in error_str or "not null" in error_str:
                errors.append(f"{po_info}{style_info}: Missing required data in one or more columns")
            else:
                errors.append(f"{po_info}{style_info}: {str(e)}")

    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            errors.append("Database error: Duplicate entry detected. Some orders may already exist.")
        elif "foreign key" in error_str:
            errors.append("Database error: Related data missing. Please check all references are valid.")
        else:
            errors.append(f"Failed to save changes to database: {str(e)}")
        return ExcelUploadResponse(
            success=False,
            rows_processed=rows_processed,
            rows_created=0,
            rows_updated=0,
            errors=errors
        )

    return ExcelUploadResponse(
        success=len(errors) == 0,
        rows_processed=rows_processed,
        rows_created=rows_created,
        rows_updated=rows_updated,
        errors=errors[:10] if errors else []  # Limit errors shown
    )


def preview_excel_import(file_bytes: bytes, db: Session) -> Dict[str, Any]:
    """
    Preview what an Excel import will do WITHOUT committing changes.
    Returns detailed info about what rows will be created/updated.
    """
    try:
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
    except openpyxl.utils.exceptions.InvalidFileException:
        return {
            "success": False,
            "error": "Invalid Excel file format. Please upload a valid .xlsx or .xlsm file.",
            "new_orders": [],
            "updated_orders": [],
            "unchanged_orders": [],
            "errors": []
        }
    except Exception as e:
        error_msg = str(e).lower()
        if "password" in error_msg or "encrypted" in error_msg:
            error = "This file is password protected. Please remove password protection and try again."
        elif "corrupt" in error_msg:
            error = "This file appears to be corrupted. Please try exporting it again from Excel."
        else:
            error = f"Could not open file: {str(e)}"
        return {
            "success": False,
            "error": error,
            "new_orders": [],
            "updated_orders": [],
            "unchanged_orders": [],
            "errors": []
        }

    if len(wb.worksheets) == 0:
        return {
            "success": False,
            "error": "The Excel file has no worksheets. Please ensure the file contains data.",
            "new_orders": [],
            "updated_orders": [],
            "unchanged_orders": [],
            "errors": []
        }

    sheet = wb.worksheets[0]
    col_map = _build_column_map(sheet)

    missing_cols = []
    if "po_number" not in col_map:
        missing_cols.append("PO#")
    if "style_code" not in col_map:
        missing_cols.append("STYLE CODE")

    if missing_cols:
        return {
            "success": False,
            "error": f"Missing required columns: {', '.join(missing_cols)}. Please ensure your file has these column headers in the first row.",
            "new_orders": [],
            "updated_orders": [],
            "unchanged_orders": [],
            "errors": []
        }

    new_orders = []
    updated_orders = []
    unchanged_orders = []
    conflicts = []
    errors = []

    # Fields that can have pending supplier approvals
    SUPPLIER_DATE_FIELDS = {'date_approved_to_production', 'revised_po_ex_factory', 'actual_date_del_to_uk'}

    start_row = _find_data_start_row(sheet, col_map)

    for row_idx in range(start_row, sheet.max_row + 1):
        try:
            po_number = _get_cell_str(sheet, row_idx, col_map.get("po_number"))
            style_code = _get_cell_str(sheet, row_idx, col_map.get("style_code"))

            if not po_number or po_number.upper() in ['INPUT', 'NONE', 'PO#', '']:
                continue
            if not style_code or style_code.upper() in ['INPUT', 'NONE', 'STYLE CODE', '']:
                continue

            # Check if exists
            existing_po = db.query(PurchaseOrder).filter(
                and_(
                    PurchaseOrder.po_number == po_number,
                    PurchaseOrder.style_code == style_code
                )
            ).first()

            po_data = _extract_row_data(sheet, row_idx, col_map)

            if existing_po:
                # Check what fields would change
                protected_fields = ['po_number', 'style_code', 'status', 'is_late']
                changes = []

                for field, new_value in po_data.items():
                    if field in protected_fields:
                        continue
                    if new_value is None or new_value == '':
                        continue

                    old_value = getattr(existing_po, field, None)
                    if _values_different(old_value, new_value):
                        # Format values for display
                        old_display = _format_value_for_display(old_value)
                        new_display = _format_value_for_display(new_value)
                        changes.append({
                            "field": field,
                            "old_value": old_display,
                            "new_value": new_display
                        })

                        # Check for pending date change conflict
                        if field in SUPPLIER_DATE_FIELDS:
                            pending = db.query(PendingDateChange).filter(
                                PendingDateChange.order_id == existing_po.id,
                                PendingDateChange.field_name == field,
                                PendingDateChange.status == "pending"
                            ).first()
                            if pending:
                                # Format the pending proposed value to dd/mm/yyyy
                                pending_display = pending.proposed_value
                                try:
                                    parsed = parse_date(pending.proposed_value)
                                    if parsed:
                                        pending_display = parsed.strftime("%d/%m/%Y")
                                except Exception:
                                    pass
                                conflicts.append({
                                    "order_id": existing_po.id,
                                    "po_number": po_number,
                                    "style_code": style_code,
                                    "field_name": field,
                                    "pending_change_id": pending.id,
                                    "current_value": old_display,
                                    "pending_proposed_value": pending_display,
                                    "excel_value": new_display,
                                    "submitted_by": pending.submitted_by_username,
                                    "reason": pending.reason,
                                })

                if changes:
                    updated_orders.append({
                        "id": existing_po.id,
                        "po_number": po_number,
                        "style_code": style_code,
                        "customer": po_data.get("customer") or existing_po.customer,
                        "description": po_data.get("description") or existing_po.description,
                        "changes": changes
                    })
                else:
                    unchanged_orders.append({
                        "po_number": po_number,
                        "style_code": style_code
                    })
            else:
                # New order
                new_orders.append({
                    "po_number": po_number,
                    "style_code": style_code,
                    "customer": po_data.get("customer", ""),
                    "description": po_data.get("description", ""),
                    "factory": po_data.get("factory", ""),
                    "colour": po_data.get("colour", ""),
                    "total_quantity": po_data.get("total_quantity", 0),
                })

        except Exception as e:
            errors.append(f"Row {row_idx}: {str(e)}")

    return {
        "success": True,
        "new_orders": new_orders,
        "updated_orders": updated_orders,
        "unchanged_orders": unchanged_orders,
        "conflicts": conflicts,
        "summary": {
            "total_rows": len(new_orders) + len(updated_orders) + len(unchanged_orders),
            "new_count": len(new_orders),
            "update_count": len(updated_orders),
            "unchanged_count": len(unchanged_orders),
            "conflict_count": len(conflicts),
        },
        "errors": errors[:10] if errors else []
    }


def _format_value_for_display(value: Any) -> str:
    """Format a value for display in the preview"""
    if value is None:
        return "Empty"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _build_column_map(sheet) -> Dict[str, int]:
    """Build a mapping of field names to column indices"""
    col_map = {}

    print("Building column map from headers...")

    # Check row 1 for headers
    for col_idx in range(1, sheet.max_column + 1):
        header = sheet.cell(1, col_idx).value
        if not header:
            continue

        header_str = str(header).strip().upper()
        print(f"  Col {col_idx}: '{header_str}'")

        # Map specific headers to field names
        # IMPORTANT: Check MORE SPECIFIC patterns FIRST before general ones

        # PO number columns - check specific patterns first
        if "SYSTEM PO" in header_str:
            col_map["system_po_number"] = col_idx
        elif "CUSTOMER PO OPEN" in header_str:  # Must come before "CUSTOMER PO"
            col_map["customer_po_open_month"] = col_idx
        elif "CUSTOMER PO#" in header_str or (header_str == "CUSTOMER PO"):  # CUSTOMER PO# specifically
            col_map["customer_po_number"] = col_idx
        elif header_str == "PO#" or (header_str == "PO" and "SYSTEM" not in header_str and "CUSTOMER" not in header_str):
            col_map["po_number"] = col_idx

        # Customer columns
        elif header_str == "CUSTOMER" or header_str == "CUSTOMER NAME":
            col_map["customer"] = col_idx
        elif "CUSTOMER STYLE" in header_str:
            col_map["customer_style_code"] = col_idx

        # Other columns
        elif header_str == "ACTIVE":
            col_map["is_active"] = col_idx
        elif "CHINA ORDERBOOK" in header_str or "ORDERBOOK REF" in header_str:
            col_map["china_orderbook_ref"] = col_idx
        elif header_str == "SEASON":
            col_map["season"] = col_idx
        elif header_str == "FACTORY":
            col_map["factory"] = col_idx
        elif header_str == "TERMS":
            col_map["terms"] = col_idx
        elif "SALES PERSON" in header_str or header_str == "SALESPERSON":
            col_map["sales_person"] = col_idx
        elif header_str == "STYLE CODE" or header_str == "STYLE":
            col_map["style_code"] = col_idx
        elif header_str == "DESCRIPTION":
            col_map["description"] = col_idx
        elif header_str == "COLOUR" or header_str == "COLOR":
            col_map["colour"] = col_idx
        elif header_str == "GENDER":
            col_map["gender"] = col_idx
        elif header_str == "TOTAL" and "ORDER" not in header_str and "VALUE" not in header_str:
            col_map["total_quantity"] = col_idx
        elif "TRADE PRICE" in header_str or header_str == "PRICE":
            col_map["trade_price"] = col_idx
        elif "TOTAL ORDER VALUE" in header_str or header_str == "ORDER VALUE":
            col_map["total_order_value"] = col_idx
        elif "ORDER RECEIVED" in header_str:
            col_map["order_received_date"] = col_idx
        elif "ORDER SENT" in header_str or "SENT TO FACTORY" in header_str:
            col_map["order_sent_to_factory_date"] = col_idx
        elif "ORIGINAL PO EX" in header_str or "ORIGINAL EX-FACTORY" in header_str:
            col_map["original_po_ex_factory"] = col_idx
        elif "APPROVED TO PRODUCTION" in header_str or "DATE APPROVED" in header_str:
            col_map["date_approved_to_production"] = col_idx
        elif "REVISED" in header_str and ("EX-FACTORY" in header_str or "EX FACTORY" in header_str):
            col_map["revised_po_ex_factory"] = col_idx
        elif "ORIGINAL DEL" in header_str and "CUSTOMER" in header_str:
            col_map["original_del_date_to_customer"] = col_idx
        elif "EXPECTED DISPATCH" in header_str or "ARRIVE TO UK MONTH" in header_str or "ARRIVE UK MONTH" in header_str:
            col_map["expected_dispatch_arrive_uk_month"] = col_idx
        elif header_str == "ETA TO UK" or header_str == "ETA UK":
            col_map["eta_to_uk"] = col_idx
        elif ("ACTUAL" in header_str and "UK" in header_str and "CUSTOMER" not in header_str) or "ACTUAL DEL UK" in header_str:
            col_map["actual_date_del_to_uk"] = col_idx
        elif header_str == "ETA TO CUSTOMER" or header_str == "ETA CUSTOMER":
            col_map["eta_to_customer"] = col_idx
        elif ("ACTUAL" in header_str and "CUSTOMER" in header_str) or "ACTUAL DEL CUSTOMER" in header_str:
            col_map["actual_date_del_to_customer"] = col_idx
        elif header_str == "LATE" or header_str == "STATUS":
            col_map["status"] = col_idx

    # Handle size columns - check row 2 for size labels if row 1 has "SIZE RANGE"
    for col_idx in range(1, sheet.max_column + 1):
        header1 = str(sheet.cell(1, col_idx).value or "").strip().upper()
        header2 = str(sheet.cell(2, col_idx).value or "").strip().upper()

        if "SIZE RANGE" in header1 or header2 in ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]:
            size_label = header2 if header2 else header1
            size_map = {
                "2XS": "size_2xs", "XS": "size_xs", "S": "size_s", "M": "size_m",
                "L": "size_l", "XL": "size_xl", "2XL": "size_2xl", "3XL": "size_3xl",
                "4XL": "size_4xl", "5XL": "size_5xl"
            }
            if size_label in size_map:
                col_map[size_map[size_label]] = col_idx

    print(f"Column mapping result: {col_map}")
    return col_map


def _find_data_start_row(sheet, col_map: Dict[str, int]) -> int:
    """Find the first row with actual data (has PO# value)"""
    po_col = col_map.get("po_number", 1)
    for row in range(2, min(sheet.max_row + 1, 50)):
        val = sheet.cell(row, po_col).value
        if val and str(val).strip() not in ['', 'None', 'INPUT', 'PO#']:
            # Check if it looks like a real PO number (numeric or alphanumeric)
            val_str = str(val).strip()
            if val_str.isdigit() or (len(val_str) > 2 and any(c.isdigit() for c in val_str)):
                return row
    return 2  # Default to row 2


def _extract_row_data(sheet, row_idx: int, col_map: Dict[str, int]) -> Dict[str, Any]:
    """Extract all field values from a row"""
    data = {}

    # Text fields
    text_fields = [
        "po_number", "system_po_number", "customer", "china_orderbook_ref",
        "customer_po_number", "season", "factory", "terms", "sales_person",
        "style_code", "customer_style_code", "description", "colour", "gender",
        "customer_po_open_month", "expected_dispatch_arrive_uk_month", "status"
    ]
    for field in text_fields:
        if field in col_map:
            data[field] = _get_cell_str(sheet, row_idx, col_map[field])

    # Boolean fields
    if "is_active" in col_map:
        data["is_active"] = parse_bool(_get_cell_value(sheet, row_idx, col_map["is_active"]))

    # Integer fields (sizes and total)
    int_fields = [
        "size_2xs", "size_xs", "size_s", "size_m", "size_l", "size_xl",
        "size_2xl", "size_3xl", "size_4xl", "size_5xl", "total_quantity"
    ]
    for field in int_fields:
        if field in col_map:
            data[field] = parse_int(_get_cell_value(sheet, row_idx, col_map[field]))

    # Float fields
    float_fields = ["trade_price", "total_order_value"]
    for field in float_fields:
        if field in col_map:
            data[field] = parse_float(_get_cell_value(sheet, row_idx, col_map[field]))

    # Date fields
    date_fields = [
        "order_received_date", "order_sent_to_factory_date", "original_po_ex_factory",
        "date_approved_to_production", "revised_po_ex_factory", "original_del_date_to_customer",
        "eta_to_uk", "actual_date_del_to_uk", "eta_to_customer", "actual_date_del_to_customer"
    ]
    for field in date_fields:
        if field in col_map:
            data[field] = parse_date(_get_cell_value(sheet, row_idx, col_map[field]))

    return data


def _get_cell_value(sheet, row: int, col: int) -> Any:
    """Get raw cell value"""
    if col is None:
        return None
    return sheet.cell(row, col).value


def _get_cell_str(sheet, row: int, col: int) -> Optional[str]:
    """Get cell value as string"""
    if col is None:
        return None
    value = sheet.cell(row, col).value
    if value is None:
        return None
    val_str = str(value).strip()
    if val_str.lower() in ['none', 'n/a', '-', '']:
        return None
    return val_str


def _calculate_order_totals(order) -> None:
    """Auto-calculate total_quantity and total_order_value for an order"""
    size_fields = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
                   'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl']
    total_qty = sum(getattr(order, f) or 0 for f in size_fields)
    if total_qty > 0:
        order.total_quantity = total_qty

    # Calculate total_order_value = trade_price × total_quantity
    if order.trade_price is not None and order.total_quantity is not None:
        order.total_order_value = round(order.trade_price * order.total_quantity, 2)


def _values_different(old_value: Any, new_value: Any) -> bool:
    """Check if two values are meaningfully different"""
    # Both None/empty
    if (old_value is None or old_value == "") and (new_value is None or new_value == ""):
        return False

    # One is None/empty, other is not
    if (old_value is None or old_value == "") != (new_value is None or new_value == ""):
        return True

    # Compare dates
    if isinstance(old_value, datetime) or isinstance(new_value, datetime):
        old_date = old_value if isinstance(old_value, datetime) else parse_date(old_value)
        new_date = new_value if isinstance(new_value, datetime) else parse_date(new_value)
        if old_date and new_date:
            return old_date.date() != new_date.date()
        return old_date != new_date

    # Compare other types
    return str(old_value).strip() != str(new_value).strip()


# =============================================================================
# EXPORT FUNCTIONS
# =============================================================================

# Template column mapping - maps database fields to template column indices
# Based on CP_-_Thomas_Enhanced.xlsx structure
TEMPLATE_COLUMN_MAP = {
    "po_number": 1,
    "system_po_number": 2,
    "is_active": 3,
    "customer": 4,
    "china_orderbook_ref": 5,
    "customer_po_number": 6,
    "season": 7,
    "factory": 8,
    "terms": 9,
    "sales_person": 10,
    "style_code": 11,
    "customer_style_code": 12,
    "description": 13,
    "colour": 14,
    "gender": 15,
    # Size columns 16-25
    "size_2xs": 16,
    "size_xs": 17,
    "size_s": 18,
    "size_m": 19,
    "size_l": 20,
    "size_xl": 21,
    "size_2xl": 22,
    "size_3xl": 23,
    "size_4xl": 24,
    "size_5xl": 25,
    # Column 26 is empty spacer
    "total_quantity": 27,
    "trade_price": 28,
    "total_order_value": 29,
    "order_received_date": 30,
    "order_sent_to_factory_date": 31,
    "original_po_ex_factory": 32,
    "date_approved_to_production": 33,
    "revised_po_ex_factory": 34,
    "original_del_date_to_customer": 35,
    "customer_po_open_month": 36,
    "expected_dispatch_arrive_uk_month": 37,
    "eta_to_uk": 38,
    "actual_date_del_to_uk": 39,
    "eta_to_customer": 40,
    "actual_date_del_to_customer": 41,
    # Column 42 is COMMENTS - managed separately in app
    "status": 43,  # LATE column
}

# Field types for formatting
FIELD_TYPES = {
    "is_active": "bool",
    "size_2xs": "int", "size_xs": "int", "size_s": "int", "size_m": "int", "size_l": "int",
    "size_xl": "int", "size_2xl": "int", "size_3xl": "int", "size_4xl": "int", "size_5xl": "int",
    "total_quantity": "int",
    "trade_price": "float",
    "total_order_value": "float",
    "order_received_date": "date",
    "order_sent_to_factory_date": "date",
    "original_po_ex_factory": "date",
    "date_approved_to_production": "date",
    "revised_po_ex_factory": "date",
    "original_del_date_to_customer": "date",
    "eta_to_uk": "date",
    "actual_date_del_to_uk": "date",
    "eta_to_customer": "date",
    "actual_date_del_to_customer": "date",
}

# Path to template file (mounted via docker-compose volume)
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "CP_-_Thomas_Enhanced.xlsx")


def export_database_to_excel(
    db: Session,
    factory_filter: str = None,
    is_supplier: bool = False,
    filters: dict = None
) -> BytesIO:
    """
    Export POs from database to Excel file using the template.
    Uses CP_-_Thomas_Enhanced.xlsx as the base template.
    Data is inserted starting at row 16 (after header and size reference rows).
    COMMENTS column is NOT exported - managed separately in the app.

    Args:
        db: Database session
        factory_filter: Filter by specific factory (for suppliers)
        is_supplier: Whether the user is a supplier (columns will be restricted)
        filters: Optional dict with filter parameters (po_number, style_code, factory, customer, status)
    """

    # Load the template file
    try:
        wb = openpyxl.load_workbook(TEMPLATE_PATH)
    except FileNotFoundError:
        print(f"Template not found at {TEMPLATE_PATH}, falling back to generating from scratch")
        return _export_database_to_excel_legacy(db, factory_filter, is_supplier)

    ws = wb.active

    # Clear any existing data from row 16 onwards
    # (in case template has sample data)
    for row in range(16, ws.max_row + 1):
        for col in range(1, 44):  # Columns A through AQ
            ws.cell(row, col).value = None

    # Query POs with filters
    query = db.query(PurchaseOrder)

    # Apply factory filter (for suppliers)
    if factory_filter:
        query = query.filter(PurchaseOrder.factory == factory_filter)

    # Apply additional filters if provided
    if filters:
        if filters.get('po_number'):
            query = query.filter(PurchaseOrder.po_number.ilike(f"%{filters['po_number']}%"))
        if filters.get('style_code'):
            query = query.filter(PurchaseOrder.style_code.ilike(f"%{filters['style_code']}%"))
        if filters.get('factory'):
            query = query.filter(PurchaseOrder.factory.ilike(f"%{filters['factory']}%"))
        if filters.get('customer'):
            query = query.filter(PurchaseOrder.customer.ilike(f"%{filters['customer']}%"))
        if filters.get('status'):
            query = query.filter(PurchaseOrder.status.ilike(f"%{filters['status']}%"))

    pos = query.order_by(PurchaseOrder.system_po_number.asc()).all()

    # Data starts at row 16
    data_start_row = 16

    # Border style for data cells
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    for row_offset, po in enumerate(pos):
        row_idx = data_start_row + row_offset

        for field_name, col_idx in TEMPLATE_COLUMN_MAP.items():
            value = getattr(po, field_name, None)
            field_type = FIELD_TYPES.get(field_name, "text")

            # Format value based on type
            if field_type == "date":
                cell_value = format_date(value)
            elif field_type == "bool":
                cell_value = "YES" if value else "NO"
            elif field_type == "float" and value is not None:
                cell_value = round(value, 2)
            else:
                cell_value = value

            cell = ws.cell(row_idx, col_idx, cell_value)
            cell.border = thin_border

            # Right-align numbers
            if field_type in ["int", "float"]:
                cell.alignment = Alignment(horizontal="right")

            # Center align dates
            if field_type == "date":
                cell.alignment = Alignment(horizontal="center")

    # For suppliers, delete columns they shouldn't see
    # Must delete from right to left to preserve column indices
    if is_supplier:
        # Columns to hide for suppliers (these are internal-only)
        # Based on SHEET1_COLUMNS where is_internal_only=True
        # Column indices in reverse order (delete from right to left)
        supplier_hidden_columns = [
            43,  # status/LATE
            41,  # actual_date_del_to_customer
            30,  # order_received_date
            29,  # total_order_value
            28,  # trade_price
            3,   # is_active
            2,   # system_po_number
        ]
        for col_idx in sorted(supplier_hidden_columns, reverse=True):
            ws.delete_cols(col_idx)

    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return output


def _export_database_to_excel_legacy(db: Session, factory_filter: str = None, is_supplier: bool = False) -> BytesIO:
    """
    Legacy export function - generates Excel from scratch.
    Used as fallback if template file is not found.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    # Styling to match original
    header_font = Font(bold=True, size=11)
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Red fill for internal-only columns
    red_fill = PatternFill(start_color="FFFF0000", end_color="FFFF0000", fill_type="solid")

    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # Write headers - Row 1
    col_idx = 1
    size_start_col = None
    size_end_col = None

    for col_name, field_name, col_type, is_internal in SHEET1_COLUMNS:
        cell = ws.cell(1, col_idx)

        # Special handling for size columns - they get a merged header
        if field_name and field_name.startswith("size_"):
            if size_start_col is None:
                size_start_col = col_idx
                cell.value = "SIZE RANGE & QTY"
            size_end_col = col_idx
            # Size labels go in row 2
            ws.cell(2, col_idx, col_name)
            ws.cell(2, col_idx).font = Font(bold=True, size=11)
            ws.cell(2, col_idx).alignment = Alignment(horizontal="center", vertical="center")
            ws.cell(2, col_idx).border = thin_border
        else:
            cell.value = col_name

        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border

        # Apply red fill for internal-only columns
        if is_internal:
            cell.fill = red_fill

        col_idx += 1

    # Merge size header cells
    if size_start_col and size_end_col:
        ws.merge_cells(start_row=1, start_column=size_start_col, end_row=1, end_column=size_end_col)

    # Query POs
    query = db.query(PurchaseOrder)
    if factory_filter:
        query = query.filter(PurchaseOrder.factory == factory_filter)

    pos = query.order_by(PurchaseOrder.po_number, PurchaseOrder.style_code).all()

    # Write data starting from row 3 (row 2 has size labels)
    data_start_row = 3

    for row_idx, po in enumerate(pos, data_start_row):
        col_idx = 1
        for col_name, field_name, col_type, is_internal in SHEET1_COLUMNS:
            if field_name is None:
                col_idx += 1
                continue

            value = getattr(po, field_name, None)

            # Format value based on type
            if col_type == "date":
                cell_value = format_date(value)
            elif col_type == "bool":
                cell_value = "YES" if value else "NO"
            elif col_type == "float" and value is not None:
                cell_value = round(value, 2)
            else:
                cell_value = value

            cell = ws.cell(row_idx, col_idx, cell_value)
            cell.border = thin_border

            # Right-align numbers
            if col_type in ["int", "float"]:
                cell.alignment = Alignment(horizontal="right")

            # Center align dates
            if col_type == "date":
                cell.alignment = Alignment(horizontal="center")

            col_idx += 1

    # Auto-adjust column widths
    for col_idx, col in enumerate(ws.columns, 1):
        max_length = 0
        column = get_column_letter(col_idx)
        for cell in col:
            try:
                if cell.value and not isinstance(cell, openpyxl.cell.cell.MergedCell):
                    max_length = max(max_length, len(str(cell.value)))
            except:
                pass
        adjusted_width = min(max_length + 2, 40)
        ws.column_dimensions[column].width = max(adjusted_width, 10)

    # Freeze header rows (row 1 and 2)
    ws.freeze_panes = "A3"

    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return output
