"""Copy orders and components out of a production pg_dump into the local SQLite DB.

Production runs PostgreSQL and local runs SQLite, so a pg_dump cannot simply be
restored here. This reads the dump's COPY blocks and rewrites them as SQLite
inserts, converting the handful of things the two engines spell differently:
NULL is \\N, booleans are t/f, and pg_dump escapes tabs, newlines and
backslashes inside values.

Only the order-side tables are touched. Users, settings, role columns, size
guide and closures are deliberately left alone — local has its own accounts and
its own migration flags, and pulling production's role_column_settings over the
top would undo the vessel-fields-read-only change that has not shipped yet.

    python load_prod_dump.py ~/Downloads/orderbook-prod-*.sql          # report
    python load_prod_dump.py ~/Downloads/orderbook-prod-*.sql --apply  # do it

DESTRUCTIVE with --apply: every row in the tables listed below is deleted first,
so the local copy matches production rather than merging into it. Take a copy of
orderbook.db before running.
"""
import os
import re
import sqlite3
import sys

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'orderbook.db')

# Order matters: parents before children, so a child never references a row
# that is not in yet. Deletes run in reverse.
TABLES = [
    'purchase_orders',
    'components',
    'order_components',
    'sample_submissions',
    'date_change_history',
    'pending_date_changes',
    'comments',
    'import_batches',
]


# Postgres prints fractional seconds with whatever precision the value has —
# "05:43:21.20161" is five digits. SQLAlchemy's SQLite DATETIME parser wants
# exactly six, or none, and raises ValueError on anything else. That error does
# not surface on insert; it surfaces later, on every read of the table, as
# "Invalid isoformat string" — so the load looks fine and the app stops loading
# orders.
_TS = re.compile(r'^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\.(\d{1,6})$')


def normalise_timestamp(v):
    m = _TS.match(v)
    if not m:
        return v
    return f'{m.group(1)}.{m.group(2).ljust(6, "0")}'


def unescape(v):
    r"""pg_dump COPY text format -> a Python value."""
    if v == r'\N':
        return None
    v = (v.replace(r'\r', '\r').replace(r'\n', '\n')
          .replace(r'\t', '\t').replace('\\\\', '\\'))
    return normalise_timestamp(v)


def parse(path):
    src = open(path, encoding='utf-8', errors='replace').read()
    out = {}
    for table, cols, body in re.findall(
            r'^COPY public\.(\w+) \(([^)]*)\) FROM stdin;\n(.*?)^\\\.$', src, re.S | re.M):
        columns = [c.strip().strip('"') for c in cols.split(',')]
        rows = []
        for line in body.split('\n'):
            if not line.strip():
                continue
            vals = [unescape(v) for v in line.split('\t')]
            if len(vals) != len(columns):
                print(f'  !! {table}: skipped a row with {len(vals)} values for {len(columns)} columns')
                continue
            rows.append(vals)
        out[table] = (columns, rows)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 2
    path = os.path.expanduser(args[0])
    apply_changes = '--apply' in sys.argv

    dump = parse(path)
    con = sqlite3.connect(DB)
    cur = con.cursor()

    def local_cols(t):
        return [r[1] for r in cur.execute(f'PRAGMA table_info({t})')]

    def local_bool_cols(t):
        return {r[1] for r in cur.execute(f'PRAGMA table_info({t})')
                if (r[2] or '').upper().startswith('BOOL')}

    print(f'\n{"table":24} {"in dump":>8} {"local now":>10}   columns')
    print('-' * 78)
    plan = []
    for t in TABLES:
        if t not in dump:
            print(f'{t:24} {"(absent)":>8}')
            continue
        cols, rows = dump[t]
        here = local_cols(t)
        if not here:
            print(f'{t:24} {len(rows):>8} {"(no table)":>10}')
            continue
        now = cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        usable = [c for c in cols if c in here]
        missing = [c for c in cols if c not in here]
        print(f'{t:24} {len(rows):>8} {now:>10}   {len(usable)}/{len(cols)} map'
              + (f'  — dropping {missing}' if missing else ''))
        plan.append((t, cols, rows, usable, local_bool_cols(t)))

    if not apply_changes:
        print('\nDRY RUN — nothing written. Re-run with --apply.\n')
        return 0

    try:
        # Children first.
        for t, *_ in reversed(plan):
            cur.execute(f'DELETE FROM {t}')
        for t, cols, rows, usable, bools in plan:
            idx = [cols.index(c) for c in usable]
            ph = ','.join('?' * len(usable))
            sql = f'INSERT INTO {t} ({",".join(usable)}) VALUES ({ph})'
            for r in rows:
                vals = []
                for c, i in zip(usable, idx):
                    v = r[i]
                    if c in bools and v is not None:
                        v = 1 if v == 't' else 0
                    vals.append(v)
                cur.execute(sql, vals)
        con.commit()
    except Exception as e:
        con.rollback()
        print(f'\nFAILED — rolled back, local DB unchanged.\n  {e}\n')
        return 1

    print('\nDONE')
    print('-' * 78)
    for t, *_ in plan:
        print(f'  {t:24} {cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]:>8}')
    print()
    con.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
