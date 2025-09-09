import type { NextApiRequest, NextApiResponse } from 'next';

function safeDecode(s: string) {
  try { return decodeURIComponent(s); } catch { return s; }
}
function contentDispositionUtf8(filenameBase: string) {
  const safe = (filenameBase || 'track')
    .replace(/[\/\\:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'track';
  return `attachment; filename="${safe}.mp3"; filename*=UTF-8''${encodeURIComponent(safe)}.mp3`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).send('bad id');

  const tail = Array.isArray(req.query.name) ? req.query.name.join('/') : String(req.query.name || '');
  const baseName = (safeDecode(tail).replace(/\.mp3$/i, '').trim()) || `nashidona-${id}`;

  // مباشرة إلى الـ CDN الافتراضي (بدون DB)
  const cdn = `https://media.nashidona.net/file/nashidona/tracks/${id}.mp3`;

  res.statusCode = 302;
  res.setHeader('Location', cdn);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', contentDispositionUtf8(baseName));
  res.end();
}
