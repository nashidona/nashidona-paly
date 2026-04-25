// pages/api/stream/[id].ts
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

    // مهم جداً: لا نعمل fetch ولا stream للـ MP3 من داخل Vercel.
    // هذا يمنع استهلاك Fast Origin Transfer على Vercel.
    const cdnUrl = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.redirect(302, cdnUrl);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
}
