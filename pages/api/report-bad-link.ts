import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string; // خدمة
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { track_id, reason, detail, retries } = req.body || {};
    if (!track_id || !reason) return res.status(400).json({ error: 'track_id and reason are required' });

    const ua = req.headers['user-agent'] || '';
    const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0]?.trim()
      || req.socket?.remoteAddress || '';

    const { error } = await supabase.from('bad_links').insert({
      track_id: Number(track_id),
      reason: String(reason).slice(0, 100),
      detail: detail ? String(detail).slice(0, 1000) : null,
      retries: Number.isFinite(Number(retries)) ? Number(retries) : null,
      user_agent: String(ua).slice(0, 500),
      ip: String(ip).slice(0, 100),
    });
    if (error) throw error;

    res.status(201).json({ ok: true });
  } catch (e: any) {
    // نرجّع 200 مع رسالة حتى لا نكسر الواجهة الأمامية
    res.status(200).json({ error: e?.message || 'unknown' });
  }
}
