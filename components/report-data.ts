'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ReportData } from '@/lib/reports';
/** Loads company-wide duty data for a date range; keeps the previous result on screen while a new range loads. */
export function useReportData(from: string, to: string) {
  const [data, setData] = useState<ReportData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    if (!from || !to || from > to) return;
    const controller = new AbortController(); setLoading(true);
    api<ReportData>(`/api/reports?from=${from}&to=${to}`, undefined, controller.signal).then(d => { setData(d); setError(''); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, reload]);
  return { data, error, loading, retry: () => setReload(n => n + 1) };
}
export const monthRange = (month: string) => { const [y, m] = month.split('-').map(Number); return { from: `${month}-01`, to: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }; };
