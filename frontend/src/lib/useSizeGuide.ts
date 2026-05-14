'use client';

import { useEffect, useState } from 'react';
import { sizeGuideApi, type SizeGuideRow } from '@/lib/api';

/**
 * Module-level cache so we only hit /api/size-guide once per page load,
 * regardless of how many components call useSizeGuide(). The settings
 * editor calls `refreshSizeGuide()` after every save so consumers re-render
 * with the latest data.
 */
let cache: SizeGuideRow[] | null = null;
let inflight: Promise<SizeGuideRow[]> | null = null;
const subscribers = new Set<(rows: SizeGuideRow[]) => void>();

async function fetchOnce(): Promise<SizeGuideRow[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = sizeGuideApi.list()
    .then(rows => {
      // Only keep active rows for read consumers — the admin editor uses
      // listAll() below to see inactive ones too.
      cache = rows;
      subscribers.forEach(fn => fn(rows));
      return rows;
    })
    .catch(err => {
      // On error keep cache null so a later call retries.
      throw err;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function refreshSizeGuide(): Promise<SizeGuideRow[]> {
  cache = null;
  return fetchOnce();
}

export function useSizeGuide(): { rows: SizeGuideRow[]; isLoading: boolean } {
  const [rows, setRows] = useState<SizeGuideRow[]>(() => cache || []);
  const [isLoading, setIsLoading] = useState(() => !cache);

  useEffect(() => {
    let active = true;
    if (!cache) {
      setIsLoading(true);
      fetchOnce()
        .then(data => { if (active) { setRows(data); setIsLoading(false); } })
        .catch(() => { if (active) setIsLoading(false); });
    }
    const sub = (data: SizeGuideRow[]) => { if (active) setRows(data); };
    subscribers.add(sub);
    return () => { active = false; subscribers.delete(sub); };
  }, []);

  return { rows, isLoading };
}

/** Lookup a single guide row by gender string from an order, e.g. "001-MENS/ ADULTS".
    Tolerates the various spacing conventions in the data ("001-MENS", "001 - MENS",
    "017- KIDS ALT 3"). */
export function findSizeGuide(rows: SizeGuideRow[], genderField?: string | null): SizeGuideRow | undefined {
  if (!genderField) return undefined;
  const code = genderField.split('-')[0]?.trim();
  if (!code) return undefined;
  return rows.find(r => r.code === code && r.is_active);
}
