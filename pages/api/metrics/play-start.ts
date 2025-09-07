// pages/api/play-start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // مفتاح السيرفس (ليس anon)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function isBot(ua: string) {
  return /(bot|spider|crawl|facebookexternalhit|twitterbot|whatsapp|telegram|google|bing|slurp|duckduck|duckduckgo|preview|embed|vkshare)/i.test(ua || '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const { id } = (req.body || {}) as { id?: number | string; fp?: string };
    const trackId = Number(id);
    if (!Number.isFinite(trackId) || trackId <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });

    // بوتات: لا نعد
    const ua = String(req.headers['user-agent'] || '');
    if (isBot(ua)) return res.json({ ok: true, skipped: 'bot' });

    // ديباونس بسيط بالكوكي: 12 ساعة لكل تراك
    const ckName = `ndps_${trackId}`;
    const hasCookie = (req.headers.cookie || '').includes(`${ckName}=1`);
    if (!hasCookie) {
      const { error } = await supabase.rpc('increment_clicks', { p_track_id: trackId });
      if (error) {
        // لا نفشل للمستخدم، فقط نسجل
        console.error('increment_clicks error:', error);
      }
    }

    // اضبط الكوكي
    res.setHeader('Set-Cookie', `${ckName}=1; Max-Age=${12 * 60 * 60}; Path=/; SameSite=Lax; HttpOnly`);

    return res.json({ ok: true, counted: !hasCookie });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}
