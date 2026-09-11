'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, X, Info, ChevronDown, ChevronRight, Check, Lock,
  AlertTriangle, Copy, Palette, Type as TypeIcon, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import api, { componentsApi, CANONICAL_POSITIONS, type CanonicalComponent, type CanonicalPosition } from '@/lib/api';
import type { Order } from '@/types';

type SampleType = 'strike_off' | 'lab_dip' | 'label';

interface Props {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  isSupplier: boolean;
  onDone: (canonicalName: string, createdCount: number, canonicalId: number) => void;
}

const SAMPLE_TAGS: Record<SampleType, { label: string; className: string }> = {
  strike_off: { label: 'SO', className: 'bg-amber-100 text-amber-700' },
  lab_dip: { label: 'LD', className: 'bg-cyan-100 text-cyan-700' },
  label: { label: 'LB', className: 'bg-fuchsia-100 text-fuchsia-700' },
};

/** The three sample flows, described in the language the design team uses.
 *  This choice is permanent — the backend locks sample_type at create and the
 *  edit endpoints reject cross-type field writes — so it gets real estate and
 *  an explicit warning rather than a 140px dropdown. */
const SAMPLE_TYPE_CARDS: {
  value: SampleType;
  title: string;
  blurb: string;
  icon: typeof Palette;
  ring: string;
  wash: string;
}[] = [
  {
    value: 'strike_off',
    title: 'Strike Off',
    blurb: 'Print or embroidery, approved in position',
    icon: TypeIcon,
    ring: 'ring-amber-400',
    wash: 'bg-amber-50',
  },
  {
    value: 'lab_dip',
    title: 'Lab Dip',
    blurb: 'Colour matched against a reference',
    icon: Palette,
    ring: 'ring-cyan-400',
    wash: 'bg-cyan-50',
  },
  {
    value: 'label',
    title: 'Label',
    blurb: 'Woven, care and branding labels',
    icon: Tag,
    ring: 'ring-fuchsia-400',
    wash: 'bg-fuchsia-50',
  },
];

export function LibraryFirstAddModal({ open, onClose, orders, isSupplier, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);

  // ── Identity ────────────────────────────────────────────────────────
  const [sampleType, setSampleType] = useState<SampleType | ''>('');
  const [name, setName] = useState('');
  const [colour, setColour] = useState('');
  const [description, setDescription] = useState('');
  const [positions, setPositions] = useState<CanonicalPosition[]>([]);
  const [specUrl, setSpecUrl] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSampleType(''); setName(''); setColour(''); setDescription('');
    setPositions([]); setSpecUrl(''); setSupplierNotes('');
    setSelectedOrderIds(new Set()); setTemplateOpen(false); setCopiedFrom(null);
  }, []);

  // Mount hidden, then transition in on the next frame — a CSS transition
  // needs two committed states to animate between.
  const [entered, setEntered] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // Cmd/Ctrl+Enter submits. Held in a ref so the key handler doesn't need to
  // re-bind on every keystroke in the form.
  const submitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) { setEntered(false); reset(); return; }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open, reset]);

  // Anything typed or ticked counts as work worth protecting.
  const dirty = Boolean(
    sampleType || name.trim() || colour.trim() || description.trim() ||
    positions.length || specUrl.trim() || supplierNotes.trim() || selectedOrderIds.size,
  );

  /** Backdrop and Escape are inert once there's unsaved work — losing a
   *  half-filled component to a stray click is the exact complaint that got
   *  the bulk-edit modal pinned open. X and Cancel still work, and both
   *  confirm when there's something to lose. */
  const attemptClose = useCallback(() => {
    if (!dirty) { onClose(); return; }
    if (window.confirm('Discard this component? Nothing has been created yet.')) onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape only when there's nothing to lose. Unlike a stray backdrop
      // click, Escape is deliberate — but it still shouldn't bin a form.
      if (e.key === 'Escape' && !dirty) onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dirty, onClose]);

  const colourRequired = sampleType === 'strike_off' || sampleType === 'lab_dip';
  const colourMissing = colourRequired && !colour.trim();
  const identityDone = Boolean(name.trim()) && Boolean(sampleType) && !colourMissing;
  const canSubmit = identityDone && selectedOrderIds.size > 0 && !submitting;

  const poCount = useMemo(() => {
    const pos = new Set<string>();
    for (const o of orders) if (selectedOrderIds.has(o.id)) pos.add(o.po_number || '—');
    return pos.size;
  }, [orders, selectedOrderIds]);

  function applyTemplate(entry: CanonicalComponent) {
    setSampleType(entry.sample_type);
    setName(entry.name);
    setColour(entry.colour || '');
    setPositions((entry.position || []) as CanonicalPosition[]);
    setCopiedFrom(entry.name);
    setTemplateOpen(false);
  }

  async function submit() {
    if (!sampleType) { toast.error('Pick a sample type before creating.'); return; }
    setSubmitting(true);
    try {
      const identity = {
        name: name.trim().toUpperCase(),
        sample_type: sampleType,
        colour: colour.trim(),
        description: description.trim() || undefined,
        position: sampleType === 'strike_off' && positions.length > 0 ? positions : undefined,
        spec_url: specUrl.trim() || undefined,
        supplier_notes: supplierNotes.trim() || undefined,
      };
      const created = await api.post('/api/components/library', identity);
      const canonicalId = created.data.id;
      const res = await api.post(`/api/components/library/${canonicalId}/apply`, {
        order_ids: Array.from(selectedOrderIds),
        starting_state: 'blank',
      });
      const createdCount = res.data?.created_count ?? 0;
      toast.success(`Added "${identity.name}" to ${createdCount} style${createdCount === 1 ? '' : 's'}`);
      onDone(identity.name, createdCount, canonicalId);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to add component');
    } finally {
      setSubmitting(false);
    }
  }

  submitRef.current = canSubmit ? submit : null;

  if (!open) return null;

  const tag = sampleType ? SAMPLE_TAGS[sampleType] : null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200',
        entered ? 'bg-gray-900/40 backdrop-blur-[2px]' : 'bg-gray-900/0',
      )}
      /* No onClick. The backdrop NEVER closes this modal, empty or not —
         a stray click outside a half-filled form is the complaint that got
         the bulk-edit modal pinned open, and this form holds far more work.
         X and Cancel are the only ways out. */
    >
      <div
        className={cn(
          'w-full max-w-6xl h-[88vh] bg-white rounded-xl shadow-2xl ring-1 ring-gray-100 flex flex-col overflow-hidden',
          'transition-all duration-200 ease-out',
          entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary-600 font-bold">New component</div>
            <h3 className="text-[17px] font-bold text-gray-900 leading-tight mt-0.5">Add component</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Creates one library entry and puts a blank sample against every style you pick.
            </p>
          </div>
          <button
            onClick={attemptClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body: identity on the left, targets on the right ───────── */}
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,440px)_1fr]">
          {/* Left column */}
          <div className="border-r border-gray-100 flex flex-col min-h-0 relative">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Step 1 — sample type */}
              <section>
                <StepHeading n={1} title="Sample type" done={Boolean(sampleType)} />
                <div className="grid grid-cols-3 gap-2">
                  {SAMPLE_TYPE_CARDS.map((c) => {
                    const on = sampleType === c.value;
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setSampleType(c.value);
                          if (c.value !== 'strike_off') setPositions([]);
                          // Straight into the next decision rather than
                          // making them go find the field.
                          requestAnimationFrame(() => nameRef.current?.focus());
                        }}
                        className={cn(
                          'relative text-left p-2.5 rounded-lg border group',
                          'transition-all duration-200 ease-out',
                          on
                            ? cn('border-transparent ring-2 shadow-sm -translate-y-0.5', c.ring, c.wash)
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:-translate-y-0.5',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-gray-900 text-white',
                            'flex items-center justify-center transition-all duration-200',
                            on ? 'opacity-100 scale-100' : 'opacity-0 scale-50',
                          )}
                        >
                          <Check className="w-2 h-2" strokeWidth={4} />
                        </span>
                        <Icon className={cn('w-4 h-4 mb-1.5 transition-colors', on ? 'text-gray-800' : 'text-gray-400 group-hover:text-gray-600')} />
                        <div className="text-[12px] font-bold text-gray-900 leading-tight">{c.title}</div>
                        <div className="text-[10px] text-gray-500 leading-snug mt-0.5">{c.blurb}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 flex-shrink-0 text-gray-400" />
                  Permanent — a component can&apos;t change type after it&apos;s created.
                </p>
              </section>

              {/* Step 2 — identity */}
              <section className={cn('transition-opacity', !sampleType && 'opacity-40 pointer-events-none select-none')}>
                <StepHeading
                  n={2}
                  title="Identity"
                  done={identityDone}
                  action={
                    <button
                      type="button"
                      onClick={() => setTemplateOpen(true)}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-600 hover:text-primary-700 normal-case tracking-normal"
                    >
                      <Copy className="w-3 h-3" />
                      Copy from existing
                    </button>
                  }
                />

                {copiedFrom && (
                  <p className="text-[10px] text-primary-700 bg-primary-50 border border-primary-100 rounded px-2 py-1 mb-2">
                    Details copied from <strong>{copiedFrom}</strong>. This is still a brand-new entry — edit anything below.
                  </p>
                )}

                <Field label="Name" required>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(e.target.value.toUpperCase())}
                    placeholder="CHEST PRINT"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md uppercase focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </Field>

                {sampleType && (
                  <DuplicateWarning
                    name={name}
                    sampleType={sampleType}
                    colour={colour}
                    onCopy={applyTemplate}
                  />
                )}

                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <Field label="Colour" required={colourRequired}>
                    <input
                      value={colour}
                      onChange={(e) => setColour(e.target.value)}
                      placeholder={colourRequired ? 'e.g. Sky Captain' : 'Optional'}
                      className={cn(
                        'w-full px-3 py-1.5 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        colourMissing && name.trim() ? 'border-red-300 bg-red-50/40' : 'border-gray-300',
                      )}
                    />
                  </Field>
                  <Field label="Spec URL">
                    <input
                      value={specUrl}
                      onChange={(e) => setSpecUrl(e.target.value)}
                      placeholder="https://…"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </Field>
                </div>

                {/* Positions are a strike-off concept only — a lab dip or a
                    label has nowhere to sit on the garment. */}
                {sampleType === 'strike_off' && (
                  <Field label="Positions" className="mt-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {CANONICAL_POSITIONS.map((p) => {
                        const on = positions.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPositions((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))}
                            className={cn(
                              'px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide border transition',
                              on
                                ? 'bg-amber-100 border-amber-300 text-amber-800'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                            )}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}

                <Field label="Description" className="mt-2.5">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Optional — what this component is"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </Field>

                <Field label="Supplier notes" className="mt-2.5">
                  <textarea
                    value={supplierNotes}
                    onChange={(e) => setSupplierNotes(e.target.value)}
                    rows={2}
                    placeholder="Anything the factory should know"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </Field>
              </section>
            </div>

            {templateOpen && (
              <TemplatePicker
                sampleType={sampleType || null}
                onPick={applyTemplate}
                onClose={() => setTemplateOpen(false)}
              />
            )}
          </div>

          {/* Right column — step 3 */}
          <div className={cn('flex flex-col min-h-0', !sampleType && 'opacity-40 pointer-events-none select-none')}>
            <div className="px-6 pt-5 pb-2 flex-shrink-0">
              <StepHeading n={3} title="Apply to styles" done={selectedOrderIds.size > 0} />
            </div>
            <TargetStylePicker
              orders={orders}
              selected={selectedOrderIds}
              onChange={setSelectedOrderIds}
            />
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────
            A live receipt, not a label: the entry is rendered here exactly
            as it will appear in the library, so the last thing you look at
            before committing is the thing itself. Fades in once there's
            something to show — same slide-and-fade as the orders bulk bar,
            without the bar actually floating. */}
        <div className="border-t border-gray-200 bg-white flex items-center gap-3 px-5 py-2.5 flex-shrink-0 shadow-[0_-1px_4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            {tag ? (
              <div
                className={cn(
                  'flex items-center gap-1.5 min-w-0 transition-all duration-200 ease-out',
                  entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                )}
              >
                <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold hidden xl:block mr-0.5">
                  Creates
                </span>
                <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0', tag.className)}>
                  {tag.label}
                </span>
                <span className={cn('text-[13px] font-semibold truncate', name.trim() ? 'text-gray-900' : 'text-gray-300 italic')}>
                  {name.trim() || 'Unnamed'}
                </span>
                {colour.trim() && (
                  <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[120px] flex-shrink-0">
                    {colour.trim()}
                  </span>
                )}
                {positions.slice(0, 2).map((p) => (
                  <span key={p} className="text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded px-1 py-0.5 flex-shrink-0 hidden lg:block">
                    {p}
                  </span>
                ))}
                {positions.length > 2 && (
                  <span className="text-[9px] text-gray-400 flex-shrink-0 hidden lg:block">+{positions.length - 2}</span>
                )}
                <span className="w-px h-4 bg-gray-200 mx-1.5 flex-shrink-0" />
                <span className="text-[11px] tabular-nums whitespace-nowrap flex-shrink-0">
                  {selectedOrderIds.size === 0 ? (
                    <span className="text-gray-400">no styles picked yet</span>
                  ) : (
                    <span className="text-gray-600">
                      <strong className="text-gray-900">{selectedOrderIds.size}</strong> style{selectedOrderIds.size === 1 ? '' : 's'}
                      {poCount > 0 && <> · <strong className="text-gray-900">{poCount}</strong> PO{poCount === 1 ? '' : 's'}</>}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-gray-400">Pick a sample type to start</span>
            )}
          </div>

          <button
            onClick={attemptClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors flex-shrink-0"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={submit}
            title={
              !sampleType ? 'Pick a sample type'
                : !name.trim() ? 'Give the component a name'
                : colourMissing ? 'Colour is required for this sample type'
                : selectedOrderIds.size === 0 ? 'Pick at least one style'
                : 'Create and add  (⌘↵)'
            }
            className={cn(
              'group inline-flex items-center gap-1.5 pl-4 pr-3 py-1.5 text-xs font-semibold text-white rounded-md flex-shrink-0',
              'bg-primary-600 hover:bg-primary-700 transition-all duration-200',
              'shadow-sm hover:shadow disabled:shadow-none',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {submitting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Create &amp; add
            {selectedOrderIds.size > 0 && ` to ${selectedOrderIds.size} style${selectedOrderIds.size === 1 ? '' : 's'}`}
            <kbd className="ml-1 text-[9px] font-sans font-bold bg-white/20 rounded px-1 py-0.5 hidden md:block">⌘↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────

/** Numbered section heading. The numbers are real here — type gates identity
 *  (it decides whether colour is required and whether positions exist), and
 *  both gate the target picker — so the sequence is information, not decor. */
function StepHeading({
  n, title, done, action,
}: { n: number; title: string; done: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span
        className={cn(
          'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
          'transition-all duration-200 ease-out',
          done ? 'bg-emerald-500 text-white scale-110' : 'bg-gray-200 text-gray-500 scale-100',
        )}
      >
        {done ? <Check className="w-2.5 h-2.5" strokeWidth={3.5} /> : n}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{title}</span>
      <span className="flex-1 h-px bg-gray-100" />
      {action}
    </div>
  );
}

function Field({
  label, required, className, children,
}: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
        {label}{' '}
        {required
          ? <span className="text-red-500 normal-case tracking-normal">(required)</span>
          : <span className="text-gray-400 normal-case tracking-normal">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

/** Warn before creating a near-identical entry.
 *
 *  Every add mints a FRESH canonical by design — there's no "reuse this one"
 *  path, deliberately. The cost of that model is that two entries with the
 *  same name, type and colour are indistinguishable in every list from then
 *  on, and nothing server-side stops it. So the guard belongs here, before
 *  the write: show the match, offer to copy its details, let them proceed
 *  knowingly. */
function DuplicateWarning({
  name, sampleType, colour, onCopy,
}: {
  name: string;
  sampleType: SampleType;
  colour: string;
  onCopy: (entry: CanonicalComponent) => void;
}) {
  const [matches, setMatches] = useState<CanonicalComponent[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const reqId = useRef(0);

  const trimmed = name.trim().toUpperCase();

  useEffect(() => { setDismissed(false); }, [trimmed]);

  useEffect(() => {
    if (trimmed.length < 2) { setMatches([]); return; }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const data = await componentsApi.listLibrary({ q: trimmed, sample_type: sampleType, include_blank: true });
        // Out-of-order responses: only the newest keystroke's result wins.
        if (id !== reqId.current) return;
        setMatches(data.components.filter((c) => (c.name || '').toUpperCase() === trimmed));
      } catch {
        if (id === reqId.current) setMatches([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [trimmed, sampleType]);

  // A different colour is a legitimately different component, so only the
  // same-colour matches are worth interrupting for.
  const exact = matches.filter(
    (c) => (c.colour || '').trim().toUpperCase() === colour.trim().toUpperCase(),
  );
  const shown = exact.length > 0 ? exact : matches;
  if (shown.length === 0 || dismissed) return null;

  const isExact = exact.length > 0;

  return (
    <div
      className={cn(
        'mt-2 rounded-md border px-2.5 py-2 flex items-start gap-2',
        isExact ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200',
      )}
    >
      {isExact
        ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        : <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[11px] font-semibold', isExact ? 'text-amber-900' : 'text-gray-700')}>
          {isExact
            ? `Already in the library${colour.trim() ? ' with this colour' : ''}`
            : `${shown.length} entr${shown.length === 1 ? 'y' : 'ies'} share this name`}
        </p>
        <ul className="mt-1 space-y-0.5">
          {shown.slice(0, 3).map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-[10px] text-gray-600 tabular-nums">
              <span className="font-semibold text-gray-800 truncate">{c.name}</span>
              {c.colour && <span className="truncate">· {c.colour}</span>}
              <span>· {c.styles_count} style{c.styles_count === 1 ? '' : 's'}</span>
              <button
                type="button"
                onClick={() => onCopy(c)}
                className="ml-auto text-primary-600 hover:text-primary-700 font-semibold whitespace-nowrap"
              >
                Copy details
              </button>
            </li>
          ))}
          {shown.length > 3 && (
            <li className="text-[10px] text-gray-400">+{shown.length - 3} more</li>
          )}
        </ul>
        <p className="text-[10px] text-gray-500 mt-1">
          Adding creates a separate entry — they&apos;ll look identical in every list.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/** Slide-over for prefilling identity from an existing entry.
 *
 *  This replaces the old "From library" tab. Copying an existing identity was
 *  never a different KIND of add — it was always just prefill — so forcing
 *  the choice up front, before you knew what you wanted, split one flow into
 *  two for no gain. */
function TemplatePicker({
  sampleType, onPick, onClose,
}: {
  sampleType: SampleType | null;
  onPick: (entry: CanonicalComponent) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<CanonicalComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const data = await componentsApi.listLibrary({
          q: q.trim() || undefined,
          sample_type: sampleType || undefined,
          include_blank: true,
        });
        if (!cancel) setEntries(data.components);
      } catch (err: any) {
        if (!cancel) toast.error(err?.response?.data?.detail || 'Failed to load library');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [q, sampleType]);

  return (
    <div className="absolute inset-0 bg-white flex flex-col z-10">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Copy from existing</div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Prefills the form below. Still creates a new entry.
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 flex-shrink-0"
          aria-label="Back"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-5 py-2.5 flex-shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, colour, PO, style code…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t border-gray-100">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No components match.</div>
        ) : (
          entries.map((c) => {
            const tag = SAMPLE_TAGS[c.sample_type];
            return (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                className="w-full text-left px-5 py-2.5 border-b border-gray-100 hover:bg-primary-50/50 transition"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider', tag.className)}>
                    {tag.label}
                  </span>
                  <span className="text-[13px] font-semibold text-gray-900 truncate">{c.name}</span>
                  {c.colour && (
                    <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 truncate max-w-[110px]">
                      {c.colour}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                  {c.styles_count} style{c.styles_count === 1 ? '' : 's'} · {c.customers_count} customer{c.customers_count === 1 ? '' : 's'}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Target style picker — grouped by PO, checkboxes, cross-PO selection
// ─────────────────────────────────────────────────────────────────────────

function TargetStylePicker({
  orders,
  selected,
  onChange,
}: {
  orders: Order[];
  selected: Set<number>;
  onChange: (ids: Set<number>) => void;
}) {
  const [q, setQ] = useState('');
  const [collapsedPos, setCollapsedPos] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) => {
      const hay = `${o.po_number || ''} ${o.customer || ''} ${o.style_code || ''} ${o.description || ''} ${o.colour || ''} ${o.customer_po_number || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [orders, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of filtered) {
      const key = o.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  function togglePoAll(styles: Order[]) {
    const next = new Set(selected);
    const allOn = styles.every((s) => next.has(s.id));
    if (allOn) styles.forEach((s) => next.delete(s.id));
    else styles.forEach((s) => next.add(s.id));
    onChange(next);
  }

  const allCollapsed = grouped.length > 0 && grouped.every(([po]) => collapsedPos.has(po));
  const visibleIds = filtered.map((o) => o.id);
  const allVisibleOn = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="flex-1 flex flex-col min-h-0 px-6 pb-5">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PO, style, customer…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const next = new Set(selected);
            if (allVisibleOn) visibleIds.forEach((id) => next.delete(id));
            else visibleIds.forEach((id) => next.add(id));
            onChange(next);
          }}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 whitespace-nowrap px-2 py-1.5"
        >
          {allVisibleOn ? 'Clear all' : 'Select all'}
        </button>
        <button
          type="button"
          onClick={() => setCollapsedPos(allCollapsed ? new Set() : new Set(grouped.map(([po]) => po)))}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 whitespace-nowrap px-2 py-1.5"
        >
          {allCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-y-auto divide-y divide-gray-100 bg-white">
        {grouped.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No matching styles.</div>
        ) : (
          grouped.map(([po, styles]) => {
            const collapsed = collapsedPos.has(po);
            const allOn = styles.every((s) => selected.has(s.id));
            const someOn = styles.some((s) => selected.has(s.id));
            const ref = styles[0];
            const onCount = styles.filter((s) => selected.has(s.id)).length;
            return (
              <div key={po}>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/70 text-xs sticky top-0 z-[1]">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }}
                    onChange={() => togglePoAll(styles)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                  />
                  <button
                    onClick={() => setCollapsedPos((prev) => {
                      const next = new Set(prev);
                      if (next.has(po)) next.delete(po); else next.add(po);
                      return next;
                    })}
                    className="text-gray-400 hover:text-gray-600 flex items-center"
                  >
                    {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <span className="font-mono font-semibold tabular-nums text-gray-900">PO {po}</span>
                  {ref?.customer && <span className="text-gray-500 truncate">· {ref.customer}</span>}
                  {ref?.factory && <span className="text-gray-400 truncate hidden lg:inline">· {ref.factory}</span>}
                  <span className="ml-auto text-[10px] tabular-nums whitespace-nowrap">
                    {onCount > 0
                      ? <span className="text-primary-600 font-semibold">{onCount}/{styles.length}</span>
                      : <span className="text-gray-400">{styles.length} styles</span>}
                  </span>
                </div>
                {!collapsed && styles.map((s) => {
                  const on = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'grid gap-3 items-center px-3 py-1.5 pl-10 text-xs border-t border-gray-100 cursor-pointer',
                        on ? 'bg-primary-50/60' : 'hover:bg-gray-50',
                      )}
                      style={{ gridTemplateColumns: '20px 140px 1fr auto' }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleOne(s.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                      />
                      <span className="font-mono tabular-nums text-gray-700 truncate">{s.style_code || `#${s.id}`}</span>
                      <span className="truncate text-gray-600">{s.description || '—'}</span>
                      <span className="text-gray-500 truncate max-w-[120px]">{s.colour || ''}</span>
                    </label>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
