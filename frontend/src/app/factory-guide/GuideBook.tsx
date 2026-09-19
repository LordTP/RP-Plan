'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The components half of the factory guide.
 *
 * Replaces a single ~1,900-line scroll. Two things were wrong with it: you
 * could not find one answer without reading past all the others, and it was
 * ordered by screen -- worklist, then library, then adding -- rather than by
 * the job someone opened it to do.
 *
 * So: one page per question, the answer in a sentence before the explanation,
 * and a search over the lot. Same content, including the add flow and the
 * fit-sample/PPS distinction, which were the parts worth keeping.
 *
 * The mock screenshots stay hand-drawn rather than captured, because a PNG
 * goes stale silently too and cannot be diffed. What they must not do is drift:
 * every label below was read off the running app on 18 Sep 2026, and
 * smoke_factory_guide.py asserts they still exist so a rename fails the build
 * rather than quietly making this wrong.
 */

type Page = {
  /** Product / Shipping / Components — the top level of the nav. */
  area: 'Product' | 'Shipping' | 'Components';
  group: string;
  id: string;
  q: string;
  /** One sentence. If it does not fit in one, the page is really two pages. */
  answer: React.ReactNode;
  body: React.ReactNode;
};

const Badge = ({ kind, children }: { kind: 'out' | 'sl' | 'ok' | 'rej'; children: React.ReactNode }) => (
  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
    kind === 'out' ? 'bg-amber-50 text-amber-700'
    : kind === 'sl' ? 'bg-blue-50 text-blue-700'
    : kind === 'ok' ? 'bg-emerald-50 text-emerald-700'
    : 'bg-rose-50 text-rose-700')}>{children}</span>
);

const Tag = ({ t }: { t: 'SO' | 'LD' | 'LB' }) => (
  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded',
    t === 'SO' ? 'bg-amber-100 text-amber-800'
    : t === 'LD' ? 'bg-cyan-100 text-cyan-800' : 'bg-fuchsia-100 text-fuchsia-800')}>{t}</span>
);

const Callout = ({ tone = 'warn', children }: { tone?: 'warn' | 'stop' | 'info'; children: React.ReactNode }) => (
  <div className={cn('rounded-lg border px-3 py-2.5 my-3 text-[13px]',
    tone === 'stop' ? 'bg-rose-50 border-rose-200 text-rose-900'
    : tone === 'info' ? 'bg-blue-50 border-blue-200 text-blue-900'
    : 'bg-amber-50 border-amber-200 text-amber-900')}>{children}</div>
);

const Shot = ({ caption, children }: { caption: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-lg border border-gray-200 overflow-hidden my-3 bg-white">
    {children}
    <p className="text-[11px] text-gray-500 px-3 py-1.5 bg-gray-50 border-t border-gray-100 m-0">{caption}</p>
  </div>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-3 mb-3.5">
    <span className="w-[26px] h-[26px] rounded-full bg-violet-600 text-white text-[12px] font-extrabold grid place-items-center">
      {n}
    </span>
    <div className="text-[13.5px] text-gray-600 [&_b]:text-gray-900">{children}</div>
  </div>
);

const Row = ({ children, cols = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_110px_70px]' }: {
  children: React.ReactNode; cols?: string;
}) => (
  <div className={cn('grid gap-2 items-center px-2.5 py-1.5 border-b border-gray-50 text-[11.5px] last:border-0', cols)}>
    {children}
  </div>
);

/** Figures below were read off the running app; the smoke test keeps them honest. */
const COMPONENT_PAGES: Omit<Page, 'area'>[] = [
  // ─────────────────────────── start here ───────────────────────────
  {
    group: 'Start here', id: 'flow', q: 'How a sample works, start to finish',
    answer: <>You add the component, make it and send it in. We log it when it arrives, then either sign
      it off or send it back with a reason — and a rejection puts the <b>same</b> component back on your
      list as v2.</>,
    body: (
      <>
        <p>Four stages. The first two are yours, the rest are ours — the badge on every row says which stage it is at.</p>
        <div className="flex items-stretch flex-wrap my-2">
          {[
            ['You', 'Added', 'You put the component on the style', 'you'],
            ['You', 'Outstanding', 'Make it and send it in', 'you'],
            ['Source Lab', 'With Source Lab', 'It arrived — we are deciding', 'us'],
            ['Done', 'Approved', 'Signed off, nothing further', 'done'],
          ].map(([who, st, dd, tone], i) => (
            <div key={st} className="flex items-stretch flex-1 min-w-[124px]">
              {i > 0 && <span className="grid place-items-center w-[18px] text-gray-400 font-bold">→</span>}
              <div className={cn('flex-1 rounded-lg border px-2.5 py-2',
                tone === 'you' ? 'bg-amber-50 border-amber-200'
                : tone === 'done' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200')}>
                <span className={cn('block text-[8.5px] font-extrabold uppercase tracking-wider',
                  tone === 'you' ? 'text-amber-700' : tone === 'done' ? 'text-emerald-700' : 'text-blue-700')}>
                  {who}
                </span>
                <span className="block text-[12.5px] font-bold leading-tight">{st}</span>
                <span className="block text-[10.5px] text-gray-500 leading-snug">{dd}</span>
              </div>
            </div>
          ))}
        </div>
        <Callout tone="stop">
          <b>↺ Rejected</b> goes back to <b>Outstanding</b> on the <i>same</i> component as <b>v2</b>, with
          the reason attached. Remake and send. It can loop again as v3.
        </Callout>
        <p className="text-[13.5px]"><b>The whole guide in one line:</b> amber is yours, blue is ours, and a
          rejection never becomes a new component.</p>
        <table className="w-full text-[12.5px] border-collapse mt-2">
          <thead>
            <tr className="bg-gray-50">
              {['Badge', 'Means', 'Do', 'Where you see it'].map(h => (
                <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><Badge kind="out">Outstanding</Badge></td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">We are waiting for it</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Make it and send it</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Worklist</td></tr>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><Badge kind="sl">With Source Lab</Badge></td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">It arrived, we are deciding</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Nothing</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Worklist</td></tr>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><Badge kind="rej">Rejected</Badge></td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Turned down with a reason</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Remake as v2</td>
              <td className="px-2.5 py-1.5 border-b border-gray-100">Worklist, under <b>Rejected</b></td></tr>
            <tr><td className="px-2.5 py-1.5"><Badge kind="ok">Approved</Badge></td>
              <td className="px-2.5 py-1.5">Signed off</td>
              <td className="px-2.5 py-1.5">Nothing</td>
              <td className="px-2.5 py-1.5"><b>Not the worklist</b> — finished samples drop off it</td></tr>
          </tbody>
        </table>
        <Callout><b>An empty worklist is the goal.</b> Samples leave it as they are signed off, so what is
          left is only what is still moving.</Callout>
      </>
    ),
  },
  {
    group: 'Start here', id: 'owe', q: 'What do I owe Source Lab right now?',
    answer: <>Open <b>Components</b>. Anything badged <Badge kind="out">Outstanding</Badge> is waiting on
      you — everything else is with us.</>,
    body: (
      <>
        <p>The page opens on <b>In development</b>: every sample still being worked on, across all your POs.</p>
        <Shot caption={<>Click a tile to filter. <b>Outstanding</b> is your list. <b>Stale 14d+</b> is the one we chase from.</>}>
          <div className="grid grid-cols-3 sm:grid-cols-6 border-b border-gray-100">
            {[['In development', '22', ''], ['Needs attention', '8', 'text-rose-600'],
              ['Rejected', '0', ''], ['Stale 14d+', '8', 'text-amber-600'],
              ['Outstanding', '11', 'text-amber-600'], ['With Source Lab', '11', '']].map(([l, v, c]) => (
              <div key={l} className="px-2.5 py-2 border-r border-gray-100 last:border-r-0">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-400">{l}</span>
                <span className={cn('block text-[15px] font-extrabold tabular-nums', c)}>{v}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 flex-wrap">
            {['Worklist', 'Library'].map((t, i) => (
              <span key={t} className={cn('text-[10.5px] font-semibold px-2 py-0.5 rounded border',
                i === 0 ? 'bg-violet-50 border-violet-200 text-violet-700' : 'border-gray-200 text-gray-500')}>{t}</span>
            ))}
            <span className="ml-auto text-[10.5px] text-gray-400">Cards · <b className="text-gray-700">Table</b></span>
          </div>
        </Shot>
        <Callout tone="info"><b>With Source Lab</b> means it arrived and we owe you a decision. Nothing to do.</Callout>
      </>
    ),
  },
  {
    group: 'Start here', id: 'read', q: 'How do I read a row?',
    answer: <>Component name, how many styles it covers, whose court it is in, and how long it has sat.</>,
    body: (
      <>
        <p>Rows sit under the PO they belong to. One component can cover several styles — sending it once covers them all.</p>
        <Shot caption={<>The last column is how long it has been waiting. <b>v2</b> means a second attempt.</>}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-100 border-y-2 border-gray-200 border-l-4 border-l-gray-400">
            <span className="font-mono text-[14px] font-extrabold">5279</span>
            <span className="text-[11.5px] font-semibold text-gray-700">STICHD</span>
            <span className="text-[11px] text-gray-500">MENS SUMMER SHOP</span>
            <span className="ml-auto text-[10.5px] text-gray-500">16 styles · ex-fac 10/12/2026</span>
          </div>
          <Row>
            <span className="flex items-center gap-1.5"><Tag t="SO" /><b>FRONT PRINT</b></span>
            <span className="font-mono text-gray-500">S006059A-0717-MCI</span>
            <span><Badge kind="out">Outstanding</Badge></span>
            <span className="font-mono text-gray-500">37d</span>
          </Row>
          <Row>
            <span className="flex items-center gap-1.5"><Tag t="LD" /><b>BULK FABRIC</b>
              <span className="text-[8.5px] font-extrabold px-1 py-0.5 rounded bg-amber-100 text-amber-800">v2</span></span>
            <span className="font-mono text-gray-500">3 styles</span>
            <span><Badge kind="sl">With Source Lab</Badge></span>
            <span className="font-mono text-gray-500">4d</span>
          </Row>
        </Shot>
        <p className="text-[13px] text-gray-500">What each badge means is on the first page, <i>How a sample works</i>.</p>
      </>
    ),
  },

  // ─────────────────────────── adding ───────────────────────────
  {
    group: 'Adding components', id: 'whoadds', q: 'Who adds components — you or us?',
    answer: <>You do. You know what the garment needs; we only know what you tell us.</>,
    body: (
      <>
        <p>If a style needs a print, an embroidery, a lab dip or a label, it is yours to add. Nothing
          chases a component that was never put on the style.</p>
        <Callout tone="stop">
          <b>Fit samples and PPS are not components.</b> They already have their own rows on the product
          page with their own dates. Adding a component called &ldquo;FIT SAMPLE&rdquo; creates a second
          thing tracking the same job, and then the two disagree.
        </Callout>
        <p>Components are the <b>parts</b> of a garment that need signing off on their own: the print, the
          colour, the trim. The garment-level samples are handled separately.</p>
      </>
    ),
  },
  {
    group: 'Adding components', id: 'add', q: 'How do I add one?',
    answer: <><b>+ Add component</b>, top right of the Components page. Three numbered steps, then it applies to every style you picked.</>,
    body: (
      <>
        <Shot caption={<>The modal as it opens. Its own subtitle says what it will do: <i>&ldquo;creates one
          library entry and puts a blank sample against every style you pick&rdquo;.</i></>}>
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="block text-[8.5px] font-extrabold uppercase tracking-wider text-violet-600">New component</span>
            <span className="block text-[13px] font-extrabold">Add component</span>
            <span className="block text-[10.5px] text-gray-500">Creates one library entry and puts a blank sample against every style you pick.</span>
          </div>
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[16px] h-[16px] rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold grid place-items-center">1</span>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Sample type</span>
              <span className="ml-auto text-[10px] text-violet-600 font-semibold">Copy an existing component</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[['Strike Off', 'Print or embroidery, approved in position'],
                ['Lab Dip', 'Colour matched against a reference'],
                ['Label', 'Woven, care and branding labels']].map(([t, d]) => (
                <div key={t} className="border border-gray-200 rounded px-2 py-1.5">
                  <span className="block text-[10.5px] font-bold">{t}</span>
                  <span className="block text-[9px] text-gray-500 leading-tight">{d}</span>
                </div>
              ))}
            </div>
            <p className="text-[9.5px] text-gray-400 mt-1 mb-0">Permanent — a component can&apos;t change type after it&apos;s created.</p>
          </div>
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[16px] h-[16px] rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold grid place-items-center">2</span>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Identity</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[9.5px] text-gray-400">
              <span className="border border-gray-200 rounded px-2 py-1">NAME <b className="text-rose-600">(required)</b></span>
              <span className="border border-gray-200 rounded px-2 py-1">COLOUR (optional)</span>
            </div>
            <p className="text-[9.5px] text-gray-400 mt-1 mb-0">More details: spec, description, supplier notes — all optional.</p>
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[16px] h-[16px] rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold grid place-items-center">3</span>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Apply to styles</span>
              <span className="ml-auto text-[10px] text-violet-600 font-semibold">Select all</span>
            </div>
            <div className="text-[10px] text-gray-500 border border-gray-200 rounded px-2 py-1.5">
              <b className="font-mono text-gray-800">PO 5252</b> · LEVY MERCHANDISING · PRIME-23 · 4 styles
              <span className="block font-mono text-[9.5px] text-gray-400 mt-0.5">S004900B-0126-NRO · NRO BABY WALES KIT SLEEPSUIT · HIGH RISK RED</span>
            </div>
          </div>
        </Shot>
        <Step n={1}><p><b>Sample type.</b> Strike off, lab dip or label. It decides which dates the
          component carries, and the modal says it plainly: <b>permanent</b>. A component cannot change
          type later — adding a new one is the way back.</p></Step>
        <Step n={2}><p><b>Identity.</b> Name and colour are the two that matter; the rest can follow.
          See <i>Getting the name right</i> — this is the field that causes the most mess.</p></Step>
        <Step n={3}><p><b>Apply to styles.</b> Tick every style this component goes on. One component
          across five styles is one submission covering five, not five jobs.</p></Step>
        <Callout>The same button sits on any style&apos;s Components section if you would rather work from
          the order.</Callout>
      </>
    ),
  },
  {
    group: 'Adding components', id: 'name', q: 'Getting the name right',
    answer: <>Name it after the thing, not the style — and keep the colour on the colour field, not in the name.</>,
    body: (
      <>
        <p>The name is how the same component is recognised across styles. Two spellings of one print make
          two components, and then nobody can see they are the same job.</p>
        <table className="w-full text-[12.5px] border-collapse mt-1">
          <thead><tr className="bg-gray-50">
            {['Do', 'Not'].map(h => <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>)}
          </tr></thead>
          <tbody>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100 font-mono">FRONT CHEST PRINT</td>
                <td className="px-2.5 py-1.5 border-b border-gray-100 font-mono text-gray-400">front print (tee)</td></tr>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100 font-mono">BULK FABRIC</td>
                <td className="px-2.5 py-1.5 border-b border-gray-100 font-mono text-gray-400">BULK FABRIC IRON</td></tr>
            <tr><td className="px-2.5 py-1.5 font-mono">SLEEVE CREST</td>
                <td className="px-2.5 py-1.5 font-mono text-gray-400">crest 2</td></tr>
          </tbody>
        </table>
        <Callout><b>The same name can be two types.</b> A lab dip and a strike off can share a name — the
          type is what separates them, and the <Tag t="SO" /> / <Tag t="LD" /> tag on the row shows which.</Callout>
      </>
    ),
  },
  {
    group: 'Adding components', id: 'copy', q: 'Can I copy one I have already made?',
    answer: <>Yes — start typing an existing name in step 2 and pick it from the list. It copies the identity, not the progress.</>,
    body: (
      <>
        <p><b>Copy an existing component</b> sits at the top right of step 1. It brings the name, type,
          colour, placement and spec across. What it does not bring is any status or date:
          <b> every add starts blank</b>, on every style you apply it to.</p>
        <Callout tone="info">That is deliberate. A new style has not had this sample approved, even if the
          identical one was signed off on another style last month.</Callout>
      </>
    ),
  },

  // ─────────────────────────── doing the work ───────────────────────────
  {
    group: 'Doing the work', id: 'what', q: 'What exactly does this component need?',
    answer: <>Click the row. The panel gives you the spec reference, the placement, the colour and any brief we wrote.</>,
    body: (
      <>
        <Shot caption={<>Under it: the brief, any comments on the style, and the full journey.</>}>
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 flex-wrap">
            <Tag t="SO" /><b className="text-[13px]">FRONT CHEST PRINT</b>
            <span className="text-[8.5px] font-extrabold px-1 py-0.5 rounded bg-amber-100 text-amber-800">v2</span>
            <span className="text-[11px] text-gray-500">S006023K-0774-MCI · BARLEY PINK</span>
          </div>
          <div className="px-3 py-2 text-[11.5px]">
            {[['Spec', 'G-T-10'], ['Colour', 'BARLEY PINK'], ['Placement', 'CHEST — CENTRAL'],
              ['Received by Source Lab', '14 Sep 2026']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-0.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{k}</span><b>{v}</b>
              </div>
            ))}
          </div>
        </Shot>
        <p>The <b>journey</b> down the right is every attempt so far with the reason each was turned down.
          That is the fastest way to see what to change.</p>
      </>
    ),
  },
  {
    group: 'Doing the work', id: 'rejected', q: 'Mine was rejected. What now?',
    answer: <>Remake it against the reason and send it in. Do <b>not</b> add a new component.</>,
    body: (
      <>
        <Callout tone="stop">
          <b>Never add a second component for a remake.</b> The next attempt is already open as <b>v2</b> on
          the one you have. A duplicate splits the history, and then neither of us can see how many attempts
          it really took.
        </Callout>
        <Shot caption={<>The banner tells you whose court it is in; the journey underneath is every attempt so far.</>}>
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
            <span className="block text-[12.5px] font-bold text-amber-900">Waiting on your remake</span>
            <span className="block text-[10.5px] text-amber-800">We rejected v1 on 18 Aug 2026. v2 hasn&apos;t arrived yet.</span>
          </div>
          <div className="px-3 py-2">
            <span className="block text-[9.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">The journey</span>
            {[['29 Jul 2026', 'Order sent to you', 'bg-gray-300'],
              ['18 Aug 2026', 'v1 rejected — reason attached', 'bg-rose-500'],
              ['Now · 23 working days', 'v2 outstanding', 'bg-amber-500']].map(([d, t, dot]) => (
              <span key={t} className="flex items-start gap-2 py-0.5">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', dot)} />
                <span className="text-[10.5px]"><span className="text-gray-400">{d}</span> — <b>{t}</b></span>
              </span>
            ))}
          </div>
        </Shot>
        <Step n={1}><p>Open the row. The banner says <b>Waiting on your remake</b> and the journey carries the reason.</p></Step>
        <Step n={2}><p>Make the change and send the sample in as normal.</p></Step>
        <Step n={3}><p>When it lands we record it — the badge turns <Badge kind="sl">With Source Lab</Badge> and the ball is with us.</p></Step>
      </>
    ),
  },
  {
    group: 'Doing the work', id: 'sent', q: 'I have sent it. Why does it still say Outstanding?',
    answer: <>Because it has not reached us yet. The badge moves when we log it in, not when you post it.</>,
    body: (
      <>
        <p>There is no &ldquo;sent&rdquo; state — the app records what has arrived. Until then it stays
          <Badge kind="out">Outstanding</Badge> and the day counter keeps running.</p>
        <Callout>Anything sitting a long time shows under <b>Stale 14d+</b>, which is the list we chase
          from. A comment on the style saves a phone call.</Callout>
      </>
    ),
  },
  {
    group: 'Doing the work', id: 'v3', q: 'It is on v3 or worse',
    answer: <>Stop resubmitting and talk to us. Three attempts means the brief and the sample disagree somewhere.</>,
    body: (
      <>
        <p>A third attempt is rarely fixed by a fourth. The attempt badge turns red at v3 for that reason.</p>
        <Callout tone="stop">Comment on the style with what you are seeing, or call. Sending a v4 against
          the same misunderstanding costs another two weeks.</Callout>
      </>
    ),
  },

  // ─────────────────────────── finding things ───────────────────────────
  {
    group: 'Finding things', id: 'library', q: 'Where do I find a component across styles?',
    answer: <>The <b>Library</b> tab — one row per component name, with every style it is on underneath.</>,
    body: (
      <>
        <Shot caption={<>An <b>entry</b> is one colour and one spec. Six BULK FABRIC entries means six colourways.</>}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-100">
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded border border-gray-200 text-gray-500">Worklist</span>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded border bg-violet-50 border-violet-200 text-violet-700">Library</span>
            <span className="ml-auto text-[11px] text-gray-400">36 names · 61 entries</span>
          </div>
          <Row cols="grid-cols-[minmax(0,1fr)_150px]">
            <span className="flex items-center gap-1.5"><Tag t="LD" /><b>BULK FABRIC</b></span>
            <span className="font-mono text-gray-500">6 entries · PO 5279</span>
          </Row>
          <Row cols="grid-cols-[minmax(0,1fr)_150px]">
            <span className="flex items-center gap-1.5"><Tag t="SO" /><b>FLAT PRINT TO SLVE</b></span>
            <span className="font-mono text-gray-500">4 entries · PO 5254</span>
          </Row>
        </Shot>
        <p>Click a style row inside an entry and you get the same panel as the worklist.</p>
      </>
    ),
  },
  {
    group: 'Finding things', id: 'search', q: 'How do I find one thing fast?',
    answer: <>Search takes anything on the row — component, PO, style code, colour, factory or the orderbook reference.</>,
    body: (
      <>
        <p>Every word has to match but the order does not: <code className="font-mono text-[11.5px] bg-gray-100 px-1 rounded">bubble puff</code> and
          <code className="font-mono text-[11.5px] bg-gray-100 px-1 rounded ml-1">puff bubble</code> both find the puff print on BUBBLE COLLECTIVE.</p>
      </>
    ),
  },

  // ─────────────────────────── reference ───────────────────────────
  {
    group: 'Reference', id: 'types', q: 'What are the sample types?',
    answer: <>Strike off is artwork, lab dip is colour, label is trims.</>,
    body: (
      <>
        <table className="w-full text-[12.5px] border-collapse">
          <thead><tr className="bg-gray-50">
            {['Tag', 'Type', 'What it proves'].map(h => (
              <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><Tag t="SO" /></td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">Strike off</td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">The artwork — print, embroidery, badge</td></tr>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><Tag t="LD" /></td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">Lab dip</td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">The colour, on the real fabric</td></tr>
            <tr><td className="px-2.5 py-1.5"><Tag t="LB" /></td>
                <td className="px-2.5 py-1.5">Label</td>
                <td className="px-2.5 py-1.5">Woven labels and trims</td></tr>
          </tbody>
        </table>
        <Callout>A lab dip and a strike off can share a name. The type is what tells them apart.</Callout>
      </>
    ),
  },
  {
    group: 'Reference', id: 'who', q: 'Who can change what?',
    answer: <>You add components, send samples and comment. Source Lab set every status and date.</>,
    body: (
      <>
        <p>Statuses and dates are read-only for you by design — they are the record of what reached us and
          when, so only we write them. The component panel says so at the bottom:
          <i>&ldquo;Status and dates are set by Source Lab.&rdquo;</i></p>
        <Callout>If a status looks wrong, comment on the style and we will fix it. You can always
          <b> + Add component</b> if one is missing.</Callout>
      </>
    ),
  },
];




/** Product — finding orders, what is editable, date changes. */
const PRODUCT_PAGES: Omit<Page, 'area'>[] = [
  {
    group: 'Start here', id: 'p-find', q: 'Where are my orders?',
    answer: <><b>Product</b> in the top nav — every order Source Lab has placed with you.</>,
    body: (
      <>
        <Shot caption={<>Four figures across the top, then one row per PO. Click a PO to open its styles,
          then a style to open its detail.</>}>
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-gray-100">
            {[['Open orders', '16', '16 shown'], ['Confirmed', '10', '51,259 units'],
              ['In development', '4', '18,774 units'], ['New order', '2', '3,000 units']].map(([l, v, sub]) => (
              <div key={l} className="px-2.5 py-2 border-r border-gray-100 last:border-r-0">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-400">{l}</span>
                <span className="block text-[15px] font-extrabold tabular-nums">{v}</span>
                <span className="block text-[9px] text-gray-400">{sub}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-gray-100 flex-wrap">
            {['Customer', 'Ex-factory', 'Missing dates'].map(f => (
              <span key={f} className="text-[9.5px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">{f}</span>
            ))}
            <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700">Group by PO</span>
            <span className="text-[9.5px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">Expand all</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_60px_88px_74px_54px] gap-2 px-2.5 py-1 bg-gray-50 border-b border-gray-200
                          text-[8.5px] font-bold uppercase tracking-wider text-gray-400">
            <span>Style</span><span>Colour</span><span>Status</span><span>Ex-factory</span><span className="text-right">Qty</span>
          </div>
          {[['5278', 'AL-HILAL', 'CAPS', '5 styles', 'New order', '09 Oct 2026', '1,000'],
            ['5260', 'TK MAXX', 'ELLE AW26 UK', '6 styles', 'Confirmed', '10 Oct 2026', '10,512'],
            ['5254', 'STICHD', 'BUBBLE COLLECTIVE', '14 styles', 'In development', '30 Oct 2026', '4,755']].map(
            ([po, cust, ref, styles, st, ex, qty]) => (
            <div key={po} className="grid grid-cols-[minmax(0,1fr)_60px_88px_74px_54px] gap-2 px-2.5 py-1.5
                                     border-b border-gray-50 last:border-0 text-[11px] items-center">
              <span className="truncate"><b className="font-mono">{po}</b>
                <span className="text-gray-500"> {cust}</span>
                <span className="text-gray-400"> — {ref}</span></span>
              <span className="text-gray-400">{styles}</span>
              <span><span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                st === 'New order' ? 'bg-gray-100 text-gray-700'
                : st === 'Confirmed' ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700')}>{st}</span></span>
              <span className="font-mono text-gray-600">{ex}</span>
              <span className="text-right font-mono text-gray-600">{qty}</span>
            </div>
          ))}
        </Shot>
        <p>The <b>status</b> is worked out from the order&apos;s own dates and samples — nobody sets it by
          hand. <b>New order</b> means we are still waiting for you to confirm an ex-factory date.</p>
        <Callout tone="info">Costings and pricing are not shown here — if you need one, ask your Source Lab
          contact.</Callout>
      </>
    ),
  },
  {
    group: 'Start here', id: 'p-read', q: 'How do I read a style?',
    answer: <>Four figures across the top, then the detail underneath: order facts, the journey, sampling and comments.</>,
    body: (
      <>
        <Shot caption="The four tiles are the summary; everything else sits under them.">
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-gray-100">
            {[['Total Qty', '400'], ['Ex-factory', '30 Oct 2026'], ['ETA Customer', '03 Jan 2027'], ['Sampling', '0 of 2']].map(([l, v]) => (
              <div key={l} className="px-2.5 py-2 border-r border-gray-100 last:border-r-0">
                <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-400">{l}</span>
                <span className="block text-[13px] font-extrabold">{v}</span>
              </div>
            ))}
          </div>
        </Shot>
        <p>Under the tiles the panel splits in two: what you have to <b>do</b> on the left, what the order
          <b> is</b> on the right.</p>
        <Shot caption={<>Left: sampling. Every component with its status, then the garment samples.</>}>
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Sampling</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">2 pending</span>
            <span className="ml-auto text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Components 3</span>
          </div>
          {[['LD', 'FIG FLEE', '5 styles', 'Approved', 'approved 9 Jul'],
            ['SO', 'FLAT PRINT TO SLVE', '2 styles', 'Approved', 'approved 4 Sep'],
            ['SO', 'PUFF PRINT FRONT AND BACK', '2 styles', 'Approved', 'approved 4 Sep']].map(([t, n, st, badge, when]) => (
            <span key={n} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-[11px]">
              <Tag t={t as 'SO' | 'LD'} /><b>{n}</b>
              <span className="text-gray-400">{st}</span>
              <span className="ml-auto"><Badge kind="ok">{badge}</Badge></span>
              <span className="text-gray-400 text-[9.5px]">{when}</span>
            </span>
          ))}
          <div className="px-3 py-1.5 text-[10.5px] text-gray-500 border-b border-gray-50">
            <b>Fit sample</b> · <b>PPS</b> · <b>Photo sample</b> · <b>Shipment sample</b> — the garment
            samples, each with their own dates
          </div>
        </Shot>
        <Shot caption={<>Right: the order&apos;s facts, then the journey — every date in order, with the
          next one to happen highlighted.</>}>
          <div className="grid sm:grid-cols-2">
            <div className="px-3 py-2 sm:border-r border-gray-100">
              <span className="block text-[9.5px] font-bold uppercase tracking-wider text-gray-500 mb-1">Order</span>
              {[['Description', 'MCI LADIES OVERSIZED HOODY'], ['Customer', 'STICHD'],
                ['Order reference', 'BUBBLE COLLECTIVE - DROP 3'], ['Colour', 'FIG'], ['Season', 'AW26']].map(([k, v]) => (
                <span key={k} className="flex justify-between gap-2 text-[10px] py-0.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400">{k}</span><b className="truncate">{v}</b>
                </span>
              ))}
            </div>
            <div className="px-3 py-2">
              <span className="block text-[9.5px] font-bold uppercase tracking-wider text-gray-500 mb-1">Journey</span>
              {[['Sent to factory', '11/06/2026', 'done'], ['Tech packs sent', '11/06/2026', 'done'],
                ['Specs sent', '26/06/2026', 'done'], ['Factory confirmed ex-fac', '30/10/2026', 'open'],
                ['Revised ex-factory', '30/10/2026', 'next'], ['ETA UK', '29/12/2026', 'open']].map(([k, v, st]) => (
                <span key={k} className="flex items-center gap-2 text-[10px] py-0.5">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0',
                    st === 'done' ? 'bg-emerald-500' : st === 'next' ? 'bg-amber-500' : 'bg-gray-200')} />
                  <span className={cn(st === 'next' && 'font-bold')}>{k}</span>
                  <b className="ml-auto font-mono text-gray-600">{v}</b>
                </span>
              ))}
            </div>
          </div>
        </Shot>
        <p><b>Comments</b> sit under the journey — that is where to raise anything about this style.</p>
      </>
    ),
  },
  {
    group: 'Start here', id: 'p-move', q: 'Moving between styles without closing',
    answer: <>The up and down arrows at the top right of the panel page through the styles in the PO.</>,
    body: <p>Handy when you are working down a list — you keep your place instead of closing and reopening.</p>,
  },
  {
    group: 'Changing things', id: 'p-edit', q: 'What can I change?',
    answer: <>Three things: the revised ex-factory date, the shipment details, and components. Everything else is read-only.</>,
    body: (
      <>
        <table className="w-full text-[12.5px] border-collapse">
          <thead><tr className="bg-gray-50">
            {['You can edit', 'Why'].map(h => <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>)}
          </tr></thead>
          <tbody>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><b>Revised ex-factory</b></td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">Goes to us as a request, not a change</td></tr>
            <tr><td className="px-2.5 py-1.5 border-b border-gray-100"><b>Shipment details</b></td>
                <td className="px-2.5 py-1.5 border-b border-gray-100">Vessel, ETD, ETA, tracking — saved directly</td></tr>
            <tr><td className="px-2.5 py-1.5"><b>Components</b></td>
                <td className="px-2.5 py-1.5">You add them; we set their statuses</td></tr>
          </tbody>
        </table>
        <Callout>Quantities, prices, customers and the original dates are ours. If one looks wrong, comment
          on the style rather than working around it.</Callout>
      </>
    ),
  },
  {
    group: 'Changing things', id: 'p-locked', q: 'Nothing is clickable yet. Why?',
    answer: <>The dates only unlock once we have sent you the order — before that there is nothing agreed to revise.</>,
    body: <p>If an order has landed with you and the fields are still locked, tell us: it usually means the
      order was not marked as sent on our side.</p>,
  },
  {
    group: 'Changing things', id: 'p-date', q: 'Requesting a date change',
    answer: <>Put the new date in <b>Revised ex-factory</b> and give a reason. It goes to Source Lab as a request.</>,
    body: (
      <>
        <Shot caption={<>Three numbered steps. The header counts what the request covers — here
          <b> 11 styles across 2 POs</b> — and step 3 lists every one of them, grouped by PO.</>}>
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="block text-[8.5px] font-extrabold uppercase tracking-wider text-violet-600">Request</span>
            <span className="block text-[13px] font-extrabold">Revised ex-factory change</span>
            <span className="block text-[10.5px] text-gray-500">11 styles across 2 POs</span>
          </div>
          {[['1', 'New date', ''],
            ['2', 'Why', 'Source Lab see this with the request, so the more specific the quicker it clears.']].map(([n, t, h]) => (
            <div key={n} className="px-3 py-2 border-b border-gray-100">
              <span className="flex items-center gap-2">
                <span className="w-[16px] h-[16px] rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold grid place-items-center">{n}</span>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">{t}</span>
              </span>
              <span className="block border border-gray-200 rounded px-2 py-1 text-[10.5px] text-gray-300 mt-1.5">&nbsp;</span>
              {h && <span className="block text-[9.5px] text-gray-400 mt-1">{h}</span>}
            </div>
          ))}
          <div className="px-3 py-2">
            <span className="flex items-center gap-2 mb-1.5">
              <span className="w-[16px] h-[16px] rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold grid place-items-center">3</span>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Styles affected</span>
            </span>
            <span className="block text-[10px] bg-gray-50 border border-gray-200 rounded px-2 py-1">
              <b className="font-mono">5260</b> <span className="text-gray-500">TK MAXX · 6 styles</span>
              <span className="block font-mono text-[9.5px] text-gray-400 mt-0.5">S004748A-0003-ELLE · ELLE LADIES HIGH WAIST BOOTCUT PANT · 10 Oct 2026</span>
              <span className="block font-mono text-[9.5px] text-gray-400">S004881A-0779-ELLE · ELLE LADIES LOOSE FIT T-SHIRT · 10 Oct 2026</span>
            </span>
          </div>
        </Shot>
        <Callout tone="info">The modal says it plainly: <i>&ldquo;Nothing moves until Source Lab approve
          it. The dates on your list stay as they are and the request shows in your tracker.&rdquo;</i></Callout>
        <Step n={1}><p>Open the style, or select several and use <b>Request date change</b> to do them together.</p></Step>
        <Step n={2}><p>Enter the new date and a reason. <b>The reason is the whole point</b> — &ldquo;mill delay,
          three weeks&rdquo; gets approved; a bare date gets a phone call.</p></Step>
        <Step n={3}><p>Submit. The date does not move yet — it shows as pending until we approve it.</p></Step>
        <Callout tone="info">One request can cover many styles, even across POs. We see it as one decision.</Callout>
      </>
    ),
  },
  {
    group: 'Changing things', id: 'p-track', q: 'What happened to my request?',
    answer: <>Your dashboard shows pending, approved and declined requests.</>,
    body: (
      <>
        <p>The <b>Requests Centre</b> sits above your orders. Closed it is a single strip; open it lists
          every request you have made.</p>
        <Shot caption="Closed — a strip above the table, so it never pushes your orders down.">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span className="w-7 h-7 rounded-lg bg-violet-100 grid place-items-center text-[13px]">↔</span>
            <span>
              <span className="block text-[12.5px] font-bold">Date change requests</span>
              <span className="block text-[10.5px] text-gray-500">4 waiting on Source Lab · 1 over a week old</span>
            </span>
            <span className="ml-auto text-[11px] font-semibold text-gray-500">Show ⌄</span>
          </div>
        </Shot>
        <Shot caption={<>Open — buckets down the left, the requests in that bucket on the right. Counts are
          styles, not requests, so they add up to what you actually asked to move.</>}>
          <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
            <div className="border-r border-gray-100 bg-gray-50/60 p-2">
              {[['Waiting on Source Lab', '9', true], ['Over a week old', '5', false],
                ['Approved — date moved', '4', false], ['Declined — date held', '2', false],
                ['Everything', '16', false]].map(([l, n, on]) => (
                <span key={l as string} className={cn('flex items-center justify-between px-1.5 py-1 rounded text-[10.5px]',
                  on ? 'bg-white font-bold text-violet-700' : 'text-gray-600')}>
                  {l}<span className="tabular-nums text-gray-400">{n}</span>
                </span>
              ))}
            </div>
            <div className="p-2">
              <span className="block text-[11px] font-bold mb-1">Waiting on Source Lab</span>
              {[['5260', '10 Oct 2026', '20 Nov 2026', '6 styles'],
                ['5278', '09 Oct 2026', '30 Oct 2026', '3 styles']].map(([po, from, to, n]) => (
                <span key={po} className="flex items-center gap-2 text-[10.5px] py-1 border-b border-gray-50 last:border-0">
                  <b className="font-mono">{po}</b>
                  <span className="text-gray-400 line-through">{from}</span>
                  <span className="text-gray-400">→</span>
                  <b>{to}</b>
                  <span className="ml-auto text-gray-400">{n}</span>
                </span>
              ))}
            </div>
          </div>
        </Shot>
        <p>Approved requests move the date. Declined ones come back with a reason and the original stands.
          <b> Sent, not answered</b> after a week is worth a chase.</p>
        <Callout>A request sitting pending for days is worth chasing in the comments — we may not have seen it.</Callout>
      </>
    ),
  },
];

/** Shipping — drafts, confirming, and the awkward cases. */
const SHIPPING_PAGES: Omit<Page, 'area'>[] = [
  {
    group: 'Start here', id: 's-draft', q: 'What is a shipment draft?',
    answer: <>A shipment you are putting together. Nothing happens on our side until you confirm it.</>,
    body: (
      <>
        <p>A draft lets you build a shipment over a few days — add SKUs, fill in the vessel when you know
          it — without telling us it is going until it actually is.</p>
        <Callout tone="info">Saving a draft is private to you. <b>Confirm</b> is the moment it becomes real.</Callout>
      </>
    ),
  },
  {
    group: 'Start here', id: 's-create', q: 'Creating one',
    answer: <>Shipping → <b>New shipment draft</b>, then pick the SKUs that are going.</>,
    body: (
      <>
        <Step n={1}><p>Pick the styles. You can take part of a PO — whatever is actually leaving.</p></Step>
        <Step n={2}><p>Set the quantity per SKU if it is not the whole line.</p></Step>
        <Step n={3}><p>Fill in the shipment details, then save or confirm.</p></Step>
      </>
    ),
  },
  {
    group: 'Start here', id: 's-fields', q: 'The shipment details',
    answer: <>Container type, vessel, ETD, ETA to port, and the tracking number.</>,
    body: (
      <table className="w-full text-[12.5px] border-collapse">
        <thead><tr className="bg-gray-50">
          {['Field', 'What it is'].map(h => <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>)}
        </tr></thead>
        <tbody>
          {[['FCL / LCL / AIR', 'How it is going. This drives the delivery estimate.'],
            ['Vessel name', 'The ship, or the airline'],
            ['Vessel ETD', 'When it leaves'],
            ['ETA to port', 'When it lands in the UK'],
            ['Tracking number / P-number', 'Your reference for it — this is what marks it shipped']].map(([k, v], i, a) => (
            <tr key={k}><td className={cn('px-2.5 py-1.5', i < a.length - 1 && 'border-b border-gray-100')}><b>{k}</b></td>
              <td className={cn('px-2.5 py-1.5', i < a.length - 1 && 'border-b border-gray-100')}>{v}</td></tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    group: 'Confirming', id: 's-save', q: 'Save or Confirm — what is the difference?',
    answer: <><b>Save</b> keeps it as a draft only you are working on. <b>Confirm</b> tells us it is shipping.</>,
    body: (
      <>
        <Callout tone="stop"><b>Confirm is not easily undone.</b> It writes the shipment across every style
          in it and puts them into our shipped view. Save as many times as you like first.</Callout>
        <p>Before confirming, check the SKU list and the quantities. Those are the two things that are
          awkward to unpick afterwards.</p>
      </>
    ),
  },
  {
    group: 'Confirming', id: 's-after', q: 'After confirming',
    answer: <>The styles show as shipped with your vessel and tracking details against them.</>,
    body: <p>If something changes after that — a delay, a correction — comment on the style and we will
      sort it rather than you creating a second shipment.</p>,
  },
  {
    group: 'Awkward cases', id: 's-cases', q: 'Split containers, part shipments, late vessels',
    answer: <>All normal. One PO can go as several shipments, and details can be filled in later.</>,
    body: (
      <table className="w-full text-[12.5px] border-collapse">
        <thead><tr className="bg-gray-50">
          {['Situation', 'What to do'].map(h => <th key={h} className="text-left px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">{h}</th>)}
        </tr></thead>
        <tbody>
          {[['Goods split across two containers', 'Two drafts. Each carries its own vessel and tracking.'],
            ['Only half a PO going this week', 'Take the SKUs that are going and set the quantities. The rest stays behind for a later draft.'],
            ['Need to add a SKU after confirming', 'Tell us — we can reopen it. Do not raise a second shipment for the same goods.'],
            ['Vessel delayed', 'Update the ETD and ETA on the shipment. The delivery estimate follows.'],
            ['No tracking number yet', 'Leave it blank and confirm. Add it when you have it — that is what marks it shipped.']].map(([k, v], i, a) => (
            <tr key={k}><td className={cn('px-2.5 py-1.5', i < a.length - 1 && 'border-b border-gray-100')}><b>{k}</b></td>
              <td className={cn('px-2.5 py-1.5', i < a.length - 1 && 'border-b border-gray-100')}>{v}</td></tr>
          ))}
        </tbody>
      </table>
    ),
  },
];

const PAGES: Page[] = [
  ...PRODUCT_PAGES.map(p => ({ ...p, area: 'Product' as const })),
  ...COMPONENT_PAGES.map(p => ({ ...p, area: 'Components' as const })),
  ...SHIPPING_PAGES.map(p => ({ ...p, area: 'Shipping' as const })),
];
const AREAS: Page['area'][] = ['Product', 'Components', 'Shipping'];

/** Plain text of a page, for search. */
function haystack(p: Page): string {
  const flat = (n: React.ReactNode): string => {
    if (n == null || typeof n === 'boolean') return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(flat).join(' ');
    const el = n as { props?: { children?: React.ReactNode } };
    return el.props ? flat(el.props.children) : '';
  };
  return `${p.q} ${flat(p.answer)} ${flat(p.body)}`.toLowerCase();
}

export function FactoryGuideBook() {
  // Tabs pick the area; the nav then lists only that area's pages. All 28 in
  // one list was the whole guide on screen at once, which is the thing the
  // rebuild was supposed to fix.
  const [area, setArea] = useState<Page['area']>('Components');
  const [current, setCurrent] = useState(
    PAGES.find(p => p.area === 'Components')!.id);
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return PAGES;
    return PAGES.filter(p => { const h = haystack(p); return words.every(w => h.includes(w)); });
  }, [q]);

  const searching = q.trim().length > 0;
  // While searching, show every match whatever tab you are on -- and label the
  // area on each, so a result from another tab does not look misfiled.
  const listed = searching ? shown : shown.filter(p => p.area === area);
  const page = listed.find(p => p.id === current) || listed[0] || null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 flex-wrap">
        <h3 className="text-[14px] font-bold text-gray-900">Factory guide</h3>
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the guide — rejected, vessel, date change, lab dip…"
            className="w-full pl-8 pr-3 py-1.5 text-[12.5px] border border-gray-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <span className="text-[11.5px] text-gray-400">
          {searching ? `${shown.length} of ${PAGES.length} pages` : `${listed.length} pages in ${area}`}
        </span>
      </div>

      {/* Area tabs. Hidden while searching: a search that only looks in the tab
          you happen to be on is worse than no search. */}
      {!searching && (
        <div className="flex items-center gap-1 px-4 pt-2.5 pb-0 border-b border-gray-200">
          {AREAS.map(a => {
            const n = PAGES.filter(p => p.area === a).length;
            return (
              <button
                key={a}
                onClick={() => {
                  setArea(a);
                  setCurrent(PAGES.find(p => p.area === a)!.id);
                }}
                className={cn('px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
                  a === area
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-900')}
              >
                {a}
                <span className="ml-1.5 text-[10.5px] font-medium text-gray-400 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid md:grid-cols-[262px_minmax(0,1fr)]">
        <nav className="border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50/70 py-2
                        md:max-h-[680px] overflow-y-auto">
          {(searching ? AREAS : [area]).map(a => {
            const inArea = listed.filter(p => p.area === a);
            if (!inArea.length) return null;
            const groups = Array.from(new Set(inArea.map(p => p.group)));
            return (
              <div key={a} className="mb-1">
                {/* The area heading only earns its place when results span
                    areas -- on a tab it would just repeat the tab. */}
                {searching && (
                  <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-900 px-4 pt-3 pb-1 m-0">
                    {a}
                  </p>
                )}
                {groups.map(g => (
                  <div key={g}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-4 pt-2.5 pb-1 m-0">{g}</p>
                    {inArea.filter(p => p.group === g).map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setCurrent(p.id); if (p.area !== area) setArea(p.area); }}
                        className={cn('block w-full text-left text-[13.5px] leading-snug px-4 py-2 border-l-[3px] transition-colors',
                          p.id === page?.id
                            ? 'bg-white text-violet-700 font-bold border-l-violet-600'
                            : 'text-gray-600 border-l-transparent hover:bg-white hover:text-gray-900')}
                      >
                        {p.q}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
          {!listed.length && <p className="text-[12px] text-gray-400 px-4 py-3 m-0">Nothing matches that.</p>}
        </nav>

        <div className="p-5 md:max-h-[680px] overflow-y-auto">
          {page ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 m-0 mb-1">
                {page.area} · {page.group}
              </p>
              <h4 className="text-[17px] font-extrabold text-gray-900 m-0 mb-1">{page.q}</h4>
              <div className="rounded-lg bg-violet-50 ring-1 ring-violet-200 px-3.5 py-2.5 my-3">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-violet-700 m-0 mb-1">Short answer</p>
                <p className="text-[13.5px] text-gray-900 m-0">{page.answer}</p>
              </div>
              <div className="text-[13.5px] text-gray-600 leading-relaxed [&_p]:my-2 [&_b]:text-gray-900">
                {page.body}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-gray-400">Nothing matches that.</p>
          )}
        </div>
      </div>
    </div>
  );
}
