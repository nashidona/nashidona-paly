import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// نستخدم service key لأننا على السيرفر ونريد تجاوز RLS بأمان
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ipRaw =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      '';
    const ip = Array.isArray(ipRaw) ? ipRaw[0] : String(ipRaw).split(',')[0].trim();

    const { type, message, contact, context, hp } = (req.body || {}) as {
      type?: string; message?: string; contact?: string;
      context?: { route?: string; query?: string; track_id?: number|string|null; track_title?: string; app_version?: string };
      hp?: string; // honeypot
    };

    // honeypot ضد السبام
    if (hp && String(hp).trim() !== '') return res.status(200).json({ ok: true });

    const t = String(type || 'bug');
    if (!['bug','idea','broken_link'].includes(t)) return res.status(400).json({ error: 'Bad type' });

    const msg = String(message || '').trim();
    if (msg.length < 5 || msg.length > 1000) return res.status(400).json({ error: 'Message length' });

    // rate limit: بحد أقصى 2 خلال دقيقة لنفس الـ IP
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recent, error: e1 } = await supabase
      .from('feedback')
      .select('id, created_at')
      .gte('created_at', oneMinAgo)
      .eq('ip', ip)
      .limit(2);
    if (!e1 && recent && recent.length >= 2) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const payload = {
      type: t,
      message: msg,
      contact: String(contact || '').slice(0, 120),
      route: String(context?.route || ''),
      query: String(context?.query || ''),
      track_id: context?.track_id ?? null,
      track_title: String(context?.track_title || ''),
      user_agent: String(req.headers['user-agent'] || ''),
      ip,
      app_version: String(context?.app_version || ''),
    };

    const { error } = await supabase.from('feedback').insert(payload);
    if (error) throw error;

    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
}
