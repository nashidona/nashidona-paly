// /pages/api/feedback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!url || !serviceKey) {
  // لا نخفي المشكلة: وضّحها حتى تظهر بالرد وبلوغز Vercel
  throw new Error('Missing Supabase env: check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { message, email, track_id } = (req.body ?? {}) as {
      message?: string; email?: string; track_id?: number | string;
    };

    const ua = String(req.headers['user-agent'] || '').slice(0, 2000);
    const page = String((req.headers['referer'] || req.headers['origin'] || '')).slice(0, 2000);

    const msg = (message ?? '').trim();
    if (msg.length < 3) return res.status(400).json({ ok: false, error: 'Message too short' });

    const payload = {
      message: msg.slice(0, 5000),
      email: email ? String(email).slice(0, 200) : null,
      track_id: track_id ? Number(track_id) : null,
      ua,
      page,
    };

    const { error } = await supabase.from('feedback').insert(payload);
    if (error) {
      console.error('feedback insert error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('feedback handler error:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
