"""The allowlist behind bulk field editing.

A bulk editor that writes "whatever field name the client sent" onto hundreds
of rows is how you lose a dataset. The import once overwrote the style code on
every row; this is the same mechanism with a nicer front end, so the rules live
here, server-side, and the endpoint maps against them rather than trusting the
request.

Three tiers:

  * absent from this file  — not editable in bulk at all, no matter what the
    request says. Anything derived, computed, or owned by another workflow
    (sample statuses reconcile themselves, tracking is set by shipping).
  * ``identity=True``      — editable, but the request must carry an explicit
    confirmation flag. These are the columns rows are matched on, so getting
    one wrong corrupts the key rather than a value, and re-importing cannot
    fix it because there is nothing left to match against.
  * everything else        — ordinary bulk-editable fields.
"""

# Column type drives both validation here and the input the UI renders.
TEXT, DATE, NUMBER, CHOICE = 'text', 'date', 'number', 'choice'


def _f(key, label, type_, group, identity=False, choices=None, max_len=None):
    return {
        'key': key, 'label': label, 'type': type_, 'group': group,
        'identity': identity, 'choices': choices, 'max_len': max_len,
    }


BULK_EDITABLE_FIELDS = [
    # --- Identity. Editable, but gated. ---
    _f('po_number', 'PO number', TEXT, 'Identity', identity=True, max_len=50),
    _f('style_code', 'Style code', TEXT, 'Identity', identity=True, max_len=100),
    _f('china_orderbook_ref', 'China orderbook ref', TEXT, 'Identity', identity=True, max_len=100),

    # --- Descriptive ---
    _f('customer', 'Customer', TEXT, 'Product', max_len=200),
    _f('factory', 'Factory', TEXT, 'Product', max_len=200),
    _f('description', 'Description', TEXT, 'Product', max_len=500),
    _f('colour', 'Colour', TEXT, 'Product', max_len=100),
    _f('gender', 'Gender', TEXT, 'Product', max_len=50),
    _f('season', 'Season', TEXT, 'Product', max_len=50),
    _f('direct_repeat_new', 'Direct / Repeat / New', TEXT, 'Product', max_len=50),
    _f('fit_sample_required', 'Fit sample required', CHOICE, 'Product', choices=['Y', 'N']),

    # --- Dates ---
    _f('order_received_date', 'Order received', DATE, 'Dates'),
    _f('order_sent_to_factory_date', 'Order sent to factory', DATE, 'Dates'),
    _f('tech_packs_sent_to_factory', 'Tech packs sent', DATE, 'Dates'),
    _f('specs_sent_to_factory', 'Specs sent', DATE, 'Dates'),
    _f('barcodes_sent_to_factory', 'Barcodes sent', DATE, 'Dates'),
    _f('original_po_ex_factory', 'Original ex-factory', DATE, 'Dates'),
    _f('factory_confirmed_ex_factory', 'Factory confirmed ex-factory', DATE, 'Dates'),
    _f('revised_po_ex_factory', 'Revised ex-factory', DATE, 'Dates'),
    _f('original_del_date_to_customer', 'Original delivery to customer', DATE, 'Dates'),
    _f('eta_to_uk', 'ETA to UK', DATE, 'Dates'),
    _f('eta_to_customer', 'ETA to customer', DATE, 'Dates'),

    # --- Notes ---
    _f('date_notes', 'Date notes', TEXT, 'Notes', max_len=500),
]

BULK_FIELD_BY_KEY = {f['key']: f for f in BULK_EDITABLE_FIELDS}

# Fields deliberately excluded, with the reason, so the next person does not
# "helpfully" add them back:
#
#   *_status / *_received / *_approved  reconcile_sample_status() derives these
#                                       from each other; writing one in bulk
#                                       without the others desyncs them. The
#                                       sample bulk panel exists for this.
#   trade_price / total_order_value     costing is out of the app entirely.
#   tracking_reference                  owned by the shipping flow, and it is
#                                       what drops an order out of warnings.
#   total_quantity / size_*             a quantity is per-style by definition;
#                                       setting one value across a selection is
#                                       never what anybody means.


def is_identity(key: str) -> bool:
    spec = BULK_FIELD_BY_KEY.get(key)
    return bool(spec and spec['identity'])


def validate_value(spec: dict, raw):
    """Coerce and bounds-check a value for one field.

    Returns (value, error). A blank is allowed for everything except identity
    fields — clearing the column rows are matched on is never a legitimate
    bulk edit, and it is exactly what the import did.
    """
    blank = raw is None or (isinstance(raw, str) and not raw.strip())

    if blank:
        if spec['identity']:
            return None, f"{spec['label']} can't be cleared — it's how rows are matched."
        return None, None

    text = str(raw).strip()

    if spec['type'] == CHOICE:
        upper = text.upper()
        allowed = [c.upper() for c in (spec['choices'] or [])]
        if upper not in allowed:
            return None, f"{spec['label']}: must be one of {', '.join(spec['choices'])}"
        return upper, None

    if spec['type'] == NUMBER:
        try:
            return float(text), None
        except ValueError:
            return None, f"{spec['label']}: '{text}' is not a number"

    if spec['type'] == DATE:
        from datetime import datetime
        for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(text[:19] if 'T' in text or ' ' in text else text, fmt), None
            except ValueError:
                continue
        return None, f"{spec['label']}: '{text}' is not a date (use YYYY-MM-DD)"

    if spec['max_len'] and len(text) > spec['max_len']:
        return None, f"{spec['label']}: longer than {spec['max_len']} characters"
    return text, None
