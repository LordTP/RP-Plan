"""Clear every order, component and their history — keeping the setup.

DESTRUCTIVE AND UNRECOVERABLE. Read the whole file before running it.

Counts by default and writes nothing. It only deletes when passed --apply,
and even then everything happens in one transaction: all of it lands or none
of it does. A half-clean is worse than either state, because you are left
with library entries pointing at styles that no longer exist.

    docker exec -it app-backend-1 python clear_order_data.py            # dry run
    docker exec -it app-backend-1 python clear_order_data.py --apply    # for real

Take a pg_dump FIRST, to a file off the droplet. A DigitalOcean snapshot rolls
back the whole machine; a dump lets you pull one table back:

    docker exec app-db-1 pg_dump -U orderbook orderbook > ~/before-clear.sql

Order matters. comments, date_change_history and pending_date_changes
reference purchase_orders WITHOUT ondelete=CASCADE, so deleting orders first
fails on a foreign key violation. They go first, explicitly.
"""
import sys

from sqlalchemy import text

from database import SessionLocal

# Deleted, in this order. The comment on each says why it is here rather than
# relying on a cascade.
WIPE = [
    # No cascade from purchase_orders — these have to go first or the order
    # delete fails outright. comment_mentions / comment_reads DO cascade off
    # comments, so they follow automatically.
    ('comments', 'no cascade from orders; takes mentions + reads with it'),
    ('date_change_history', 'no cascade from orders; the audit trail'),
    ('pending_date_changes', 'no cascade from orders; unapproved supplier requests'),

    # These would cascade, but doing them explicitly means the counts below
    # report what actually went rather than leaving it implied.
    ('sample_submissions', 'cascades from orders, done explicitly for the count'),
    ('shipment_draft_orders', 'cascades from orders, done explicitly for the count'),
    ('shipment_drafts', 'drafts themselves — orphaned once their lines go'),
    ('qa_checks', 'per-order QA records'),
    ('order_components', 'cascades from orders, done explicitly for the count'),

    ('purchase_orders', 'the orders'),

    # canonical_id is ondelete=SET NULL, so wiping orders leaves every library
    # entry behind attached to nothing. Explicit delete or the library is full
    # of ghosts.
    ('components', 'the canonical library — SET NULL, so never cascades'),

    ('import_batches', 'import history, meaningless once the rows are gone'),
    ('notification_sent', 'keyed on po_number; every row is stale after this'),
]

# Left alone. Listed so the intent is explicit rather than implied by absence.
KEEP = [
    ('users', 'logins'),
    ('app_settings', 'warning thresholds, email automations'),
    ('role_column_settings', 'per-role column visibility'),
    ('size_guide', 'size ranges'),
    ('notification_recipients', 'who gets which email'),
    ('factory_closures', 'the Chinese New Year windows'),
]


def counts(db, tables):
    out = {}
    for t in tables:
        try:
            out[t] = db.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()
        except Exception:
            out[t] = None  # table not present on this database
    return out


def main():
    apply_changes = '--apply' in sys.argv
    db = SessionLocal()

    wipe_tables = [t for t, _ in WIPE]
    keep_tables = [t for t, _ in KEEP]
    before = counts(db, wipe_tables)
    kept_before = counts(db, keep_tables)

    print('\nWILL BE DELETED')
    print('─' * 68)
    total = 0
    for t, why in WIPE:
        n = before[t]
        if n is None:
            print(f'  {t:<24} {"(no such table)":>10}   {why}')
            continue
        total += n
        print(f'  {t:<24} {n:>10,}   {why}')
    print(f'  {"":<24} {total:>10,}   rows in total')

    print('\nWILL BE KEPT')
    print('─' * 68)
    for t, why in KEEP:
        n = kept_before[t]
        print(f'  {t:<24} {("—" if n is None else f"{n:,}"):>10}   {why}')

    if not apply_changes:
        print('\nDRY RUN — nothing was written. Re-run with --apply to delete.\n')
        db.close()
        return 0

    if total == 0:
        print('\nNothing to delete.\n')
        db.close()
        return 0

    print(f'\nAbout to permanently delete {total:,} rows.')
    typed = input(f'Type the number {total} to confirm: ').strip()
    if typed != str(total):
        print('Did not match. Nothing was deleted.\n')
        db.close()
        return 1

    # One transaction. Any failure rolls the whole thing back rather than
    # leaving orders gone and their history behind.
    try:
        for t, _ in WIPE:
            if before[t] is None:
                continue
            db.execute(text(f'DELETE FROM {t}'))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f'\nFAILED — rolled back, nothing deleted.\n  {e}\n')
        db.close()
        return 1

    after = counts(db, wipe_tables)
    kept_after = counts(db, keep_tables)
    print('\nDONE')
    print('─' * 68)
    for t, _ in WIPE:
        if before[t] is None:
            continue
        print(f'  {t:<24} {before[t]:>10,} -> {after[t]:,}')
    print('\n  kept:')
    for t, _ in KEEP:
        print(f'  {t:<24} {("—" if kept_before[t] is None else f"{kept_before[t]:,}"):>10} -> '
              f'{"—" if kept_after[t] is None else f"{kept_after[t]:,}"}')

    leftover = [t for t in wipe_tables if after.get(t)]
    print(f'\n{"CLEAN" if not leftover else "STILL POPULATED: " + ", ".join(leftover)}\n')
    db.close()
    return 0 if not leftover else 1


if __name__ == '__main__':
    sys.exit(main())
