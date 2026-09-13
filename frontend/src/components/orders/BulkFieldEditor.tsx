'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Search, AlertTriangle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { bulkEditApi, type BulkEditableField, type BulkEditPreview, type BulkCurrentValues } from '@/lib/api';

/**
 * Bulk field editor — pick a field, set a value, see exactly what changes,
 * then commit.
 *
 * The preview step is not decoration. Import once overwrote the style code on
 * every row, and this is the same mechanism behind a nicer control: one value
 * written across a selection with no per-row confirmation. So nothing is
 * written until the user has seen the count of rows that change, the count
 * already carrying a different value that will be overwritten, and a sample of
 * the actual before→after.
 *
 * The field list comes from the server rather than being duplicated here —
 * the allowlist has one definition, in backend/bulk_fields.py, and the server
 * re-validates everything this component sends.
 */

interface Props {
  orderIds: number[];
  /** Drop one style from the selection. Owned by the caller so the bulk bar's
      count stays in step with what the modal is about to change — two
      different ideas of "selected" is exactly how the wrong rows get written. */
  onDeselect: (orderId: number) => void;
  onClose: () => void;
  onApplied: () => void;
}

export function BulkFieldEditor({ orderIds, onDeselect, onClose, onApplied }: Props) {
  const [fields, setFields] = useState<BulkEditableField[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<BulkEditableField | null>(null);
  const [value, setValue] = useState('');
  const [identityOk, setIdentityOk] = useState(false);
  const [preview, setPreview] = useState<BulkEditPreview | null>(null);
  const [current, setCurrent] = useState<BulkCurrentValues | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bulkEditApi.fields()
      .then(r => setFields(r.fields))
      .catch(() => toast.error('Could not load the field list'))
      .finally(() => setLoading(false));
  }, []);

  // Removing the last style leaves nothing to edit.
  useEffect(() => { if (orderIds.length === 0) onClose(); }, [orderIds.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Changing anything invalidates the preview — a preview for a value you
  // have since edited is worse than no preview.
  useEffect(() => { setPreview(null); }, [picked, value, identityOk]);

  // Pull what is already set the moment a field is picked, before anything is
  // typed. Seeing "all 4 already say HIGH RISK RED" or "3 say one thing, 1 is
  // blank" is what tells you whether this edit is a fix or a mistake.
  useEffect(() => {
    if (!picked) { setCurrent(null); return; }
    let alive = true;
    setLoadingCurrent(true);
    bulkEditApi.current(orderIds, picked.key)
      .then(r => { if (alive) setCurrent(r); })
      .catch(() => { if (alive) setCurrent(null); })
      .finally(() => { if (alive) setLoadingCurrent(false); });
    return () => { alive = false; };
  }, [picked, orderIds]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = q
      ? fields.filter(f => f.label.toLowerCase().includes(q) || f.key.includes(q))
      : fields;
    const m = new Map<string, BulkEditableField[]>();
    for (const f of matching) {
      const g = m.get(f.group);
      if (g) g.push(f); else m.set(f.group, [f]);
    }
    return Array.from(m.entries());
  }, [fields, search]);

  const blocked = !!picked?.identity && !identityOk;
  const canPreview = !!picked && !blocked && (!picked.identity || value.trim() !== '');

  async function run(apply: boolean) {
    if (!picked) return;
    setBusy(true);
    try {
      const r = await bulkEditApi.run({
        order_ids: orderIds,
        field_name: picked.key,
        new_value: value.trim() === '' ? null : value,
        apply,
        confirm_identity: picked.identity ? identityOk : undefined,
      });
      if (apply) {
        toast.success(`Updated ${r.updated} ${r.updated === 1 ? 'style' : 'styles'}`);
        onApplied();
        onClose();
      } else {
        setPreview(r);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bulk edit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-6">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[86vh]">
        <div className="px-5 pt-4 pb-3 flex items-start gap-3 flex-none">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">Edit a field</h3>
            <p className="text-[12px] text-gray-500 mt-1">
              Sets one field across <b className="text-gray-700">{orderIds.length}</b>{' '}
              selected {orderIds.length === 1 ? 'style' : 'styles'}.
            </p>
          </div>
          <button onClick={onClose} disabled={busy}
                  className="p-1 -mr-1 text-gray-300 hover:text-gray-700 rounded disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-[240px_1fr] border-t border-gray-100 min-h-0 flex-1">
          {/* Field picker */}
          <div className="border-r border-gray-100 bg-gray-50/60 flex flex-col min-h-0">
            <div className="p-2 flex-none">
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                <Search className="w-3 h-3 text-gray-400 flex-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Find a field…"
                  className="w-full text-[12px] focus:outline-none bg-transparent"
                />
              </div>
            </div>
            <div className="overflow-y-auto px-2 pb-2 min-h-0">
              {loading && <div className="py-8 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-300 mx-auto" /></div>}
              {groups.map(([group, items]) => (
                <div key={group} className="mb-3">
                  <div className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-wider text-gray-400">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {items.map(f => (
                      <button
                        key={f.key}
                        onClick={() => { setPicked(f); setValue(''); setIdentityOk(false); }}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded-md text-[12px] flex items-center gap-1.5',
                          picked?.key === f.key
                            ? 'bg-primary-600 text-white font-semibold'
                            : 'text-gray-700 hover:bg-gray-200/70',
                        )}
                      >
                        <span className="truncate">{f.label}</span>
                        {f.identity && (
                          <span className={cn(
                            'ml-auto text-[8.5px] font-bold uppercase tracking-wide px-1 py-0.5 rounded flex-none',
                            picked?.key === f.key ? 'bg-white/25' : 'bg-amber-100 text-amber-700',
                          )}>
                            key
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selection → Change to → Currently set */}
          <div className="p-4 overflow-y-auto min-h-0">
            {!picked && (
              <div className="h-full flex items-center justify-center text-center text-[13px] text-gray-400 py-10">
                Pick a field on the left to see what the selected styles hold.
              </div>
            )}

            {picked && (
              <div className="space-y-4">
                {/* ── 1. what is selected, and a way out of it ── */}
                <section>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h4 className="text-[12px] font-bold text-gray-900">Selected</h4>
                    <span className="text-[11px] text-gray-400">
                      {orderIds.length} {orderIds.length === 1 ? 'style' : 'styles'}
                      {current && current.po_count > 1 && ` · ${current.po_count} POs`}
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400">
                      Remove any you didn&apos;t mean to include
                    </span>
                  </div>

                  {loadingCurrent && !current && (
                    <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-300 mx-auto" /></div>
                  )}

                  {current && (
                    <div className="rounded-lg border border-gray-200 overflow-hidden max-h-[230px] overflow-y-auto">
                      {current.by_po.map(g => (
                        <div key={g.po_number}>
                          <div className="sticky top-0 bg-gray-50/95 backdrop-blur-sm px-3 py-1.5
                                          border-b border-gray-100 flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-primary-600">{g.po_number}</span>
                            <span className="text-[10.5px] text-gray-400 truncate">
                              {[g.customer, g.factory].filter(Boolean).join(' · ')}
                            </span>
                            <span className="ml-auto flex-none text-[10.5px] text-gray-400">
                              {g.rows.length}
                            </span>
                          </div>
                          <ul>
                            {g.rows.map(r => (
                              <li key={r.order_id}
                                  className="px-3 py-1.5 border-b border-gray-50 flex items-center gap-3 text-[11.5px]
                                             hover:bg-gray-50">
                                <span className="font-mono text-gray-800 truncate w-[150px] flex-none">{r.style_code}</span>
                                <span className="text-gray-400 truncate min-w-0 flex-1">{r.description}</span>
                                <span className="flex-none max-w-[150px] truncate text-right font-medium text-gray-900">
                                  {r.value || <span className="text-gray-300 italic font-normal">not set</span>}
                                </span>
                                <button
                                  onClick={() => onDeselect(r.order_id)}
                                  title="Remove from this edit"
                                  /* Always visible, not hover-only — a control
                                     nobody can see is a control nobody uses. */
                                  className="flex-none p-0.5 rounded text-gray-300 hover:text-red-600
                                             hover:bg-red-50 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* ── 2. the change ── */}
                <section>
                  <h4 className="text-[12px] font-bold text-gray-900 mb-2">Change to</h4>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {picked.type === 'choice' ? (
                        <select
                          value={value}
                          onChange={e => setValue(e.target.value)}
                          className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-lg bg-white
                                     focus:outline-none focus:ring-2 focus:ring-primary-200"
                        >
                          <option value="">— Pick one —</option>
                          {(picked.choices || []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input
                          type={picked.type === 'date' ? 'date' : picked.type === 'number' ? 'number' : 'text'}
                          value={value}
                          onChange={e => setValue(e.target.value)}
                          placeholder={picked.identity ? `New ${picked.label.toLowerCase()} (required)` : 'Leave blank to clear'}
                          className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-primary-200"
                        />
                      )}
                      {!picked.identity && (
                        <span className="block text-[11px] text-gray-400 mt-1">
                          Blank clears {picked.label} on every selected style.
                        </span>
                      )}
                    </div>
                    {!preview && (
                      <button
                        onClick={() => run(false)}
                        disabled={!canPreview || busy}
                        className="flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                   bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800
                                   disabled:opacity-40 disabled:hover:bg-gray-900"
                      >
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Preview
                      </button>
                    )}
                  </div>

                  {picked.identity && (
                    <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-none" />
                        <div className="text-[11.5px] text-amber-900 leading-snug">
                          <b>{picked.label} is how rows are matched to each other.</b> Changing it in
                          bulk re-points every style at once, and re-importing can&apos;t undo it —
                          the old value is what a re-import would match on.
                        </div>
                      </div>
                      <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={identityOk}
                          onChange={e => setIdentityOk(e.target.checked)}
                          className="h-3.5 w-3.5 mt-0.5 flex-none"
                        />
                        <span className="text-[11.5px] font-semibold text-amber-900">
                          I understand — change {picked.label} on all {orderIds.length}
                        </span>
                      </label>
                    </div>
                  )}

                  {preview && (
                    <div className="mt-2.5 rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-5 text-[11.5px] flex-wrap">
                        <span><b className="text-[15px] text-gray-900 tabular-nums">{preview.will_change}</b> <span className="text-gray-500">will change</span></span>
                        {preview.overwriting > 0 && (
                          <span><b className="text-[15px] text-amber-700 tabular-nums">{preview.overwriting}</b> <span className="text-gray-500">overwritten</span></span>
                        )}
                        {preview.already_correct > 0 && (
                          <span><b className="text-[15px] text-gray-400 tabular-nums">{preview.already_correct}</b> <span className="text-gray-500">already correct</span></span>
                        )}
                      </div>
                      {preview.will_change === 0 ? (
                        <div className="px-3 py-5 text-center text-[12.5px] text-gray-500">
                          Nothing to do — every selected style already has this value.
                        </div>
                      ) : (
                        <>
                          <ul className="max-h-36 overflow-y-auto text-[11.5px]">
                            {preview.examples.map(ex => (
                              <li key={ex.order_id} className="px-3 py-1.5 border-b border-gray-50 flex items-center gap-2">
                                <span className="font-mono text-[10.5px] text-primary-600 font-semibold flex-none">{ex.po_number}</span>
                                <span className="font-mono text-gray-500 truncate w-[150px] flex-none">{ex.style_code}</span>
                                <span className="ml-auto flex items-center gap-2 flex-none min-w-0">
                                  <span className="text-gray-400 line-through truncate max-w-[150px]">{ex.from || 'blank'}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-300 flex-none" />
                                  <span className="font-semibold text-gray-900 truncate max-w-[150px]">{ex.to || 'blank'}</span>
                                </span>
                              </li>
                            ))}
                            {preview.will_change > preview.examples.length && (
                              <li className="px-3 py-1.5 text-[11px] text-gray-400 italic">
                                …and {preview.will_change - preview.examples.length} more
                              </li>
                            )}
                          </ul>
                          <div className="px-3 py-2.5 bg-gray-50/60 border-t border-gray-200 flex items-center justify-end gap-2">
                            <button
                              onClick={() => setPreview(null)}
                              disabled={busy}
                              className="px-3 py-1.5 text-[12.5px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => run(true)}
                              disabled={busy}
                              className="px-4 py-1.5 rounded-lg bg-primary-600 text-white text-[12.5px]
                                         font-semibold hover:bg-primary-700 disabled:opacity-50
                                         inline-flex items-center gap-2"
                            >
                              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Apply to {preview.will_change} {preview.will_change === 1 ? 'style' : 'styles'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

                {/* ── 3. what those styles hold today, in aggregate ── */}
                {current && (
                  <section>
                    <h4 className="text-[12px] font-bold text-gray-900 mb-2">
                      Currently set <span className="font-normal text-gray-400">· {picked.label}</span>
                    </h4>
                    {current.uniform ? (
                      <div className="rounded-lg border border-gray-200 px-3 py-2.5 bg-gray-50/60 flex items-baseline gap-2">
                        <span className="text-[11px] text-gray-500 flex-none">
                          All {current.total} the same
                        </span>
                        <span className="text-[13px] font-semibold text-gray-900 truncate">
                          {current.distinct[0].value || <span className="text-gray-400 italic font-normal">not set</span>}
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-500">
                          {current.distinct.length} different values across {current.total} styles
                        </div>
                        <ul className="divide-y divide-gray-50 max-h-[130px] overflow-y-auto">
                          {current.distinct.map(d => (
                            <li key={d.value} className="px-3 py-1.5 flex items-center gap-3 text-[12px]">
                              <span className="truncate">
                                {d.value || <span className="text-gray-400 italic">not set</span>}
                              </span>
                              {/* A bar makes the split legible without reading numbers. */}
                              <span className="ml-auto flex items-center gap-2 flex-none">
                                <span className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <span className="block h-full bg-primary-400"
                                        style={{ width: `${(d.count / current.total) * 100}%` }} />
                                </span>
                                <span className="font-mono text-[11px] text-gray-500 tabular-nums w-5 text-right">
                                  {d.count}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
