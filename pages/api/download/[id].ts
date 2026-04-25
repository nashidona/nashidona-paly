// pages/api/download/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const id = String(req.query.id || '').trim();
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'bad_id' });
    }

    // تحويل مباشر إلى Cloudflare / Backblaze بدون استعلام Supabase وبدون تمرير الملف عبر Vercel.
    const target = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.redirect(302, target);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
}
