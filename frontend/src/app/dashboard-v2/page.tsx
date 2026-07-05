'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /dashboard-v2 was the preview URL while we A/B-tested the new layout.
 * The new layout is now the only dashboard (see /dashboard), so anyone
 * hitting this URL — bookmarks, old links — gets punted forward.
 */
export default function DashboardV2Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
