import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const idsRaw = String(req.query.ids ?? '').trim();
    const parentRaw = String(req.query.parent_id ?? '').trim();

    let q = supabase
      .from('classes')
      .select('id,name,type,parent_id,sort_order,image_url');

    if (idsRaw) {
      const ids = idsRaw
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n));
      if (ids.length) q = q.in('id', ids);
    } else if (parentRaw !== '') {
      const pid = parseInt(parentRaw, 10);
      if (Number.isFinite(pid)) q = q.eq('parent_id', pid);
      else q = q.is('parent_id', null);
    }

    const { data, error } = await q
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) throw error;

    res.status(200).json({ items: data ?? [] });
  } catch (err: any) {
    res.status(200).json({ items: [], error: err?.message || String(err) });
  }
}
