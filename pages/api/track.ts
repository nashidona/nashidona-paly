// pages/api/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// نكوّن العميل بطريقة آمنة: Service Role إن وُجد وإلا Anon
function getSupabase() {
  const url =
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.SUPABASE_URL as string | undefined);

  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);

  if (!url || !key) {
    throw new Error(
      'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const idRaw = req.query.id;
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ error: 'missing id' });
    }

    const supabase = getSupabase();
    // نقرأ الصف الأساسي أولاً (سلوك قديم + أساس للنمط الموسع)
    const { data: tr, error } = await supabase
      .from('tracks')
      .select('id, title, year, lyrics, cover_url, album_id, artist_id')
      .eq('id', idNum)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!tr) return res.status(404).json({ error: 'not found' });

    // السلوك القديم: نرجّع فقط lyrics
    const basic = { lyrics: (tr.lyrics ?? '') as string };

    // إن لم يُطلب وضع موسّع -> أعد القديم كما هو
    const wantFull =
      String(req.query.full || '').toLowerCase() === '1' ||
      String(req.query.full || '').toLowerCase() === 'true';

    if (!wantFull) {
      return res.status(200).json(basic);
    }

    // وضع موسّع (لصفحة المشاركة /t/[id])
    let albumTitle: string | null = null;
    let albumYear: string | null = null;
    let albumCover: string | null = null;
    let artistName: string | null = null;

    // نجلب الألبوم/المنشد إذا كان لديهم مفاتيح
    if (tr.album_id) {
      const { data: alb } = await supabase
        .from('albums')
        .select('title, year, cover_url')
        .eq('id', tr.album_id)
        .maybeSingle();
      albumTitle = alb?.title ?? null;
      albumYear = (alb?.year as string | null) ?? (tr.year as string | null) ?? null;
      albumCover = alb?.cover_url ?? tr.cover_url ?? null;
    } else {
      albumYear = (tr.year as string | null) ?? null;
      albumCover = tr.cover_url ?? null;
    }

    if (tr.artist_id) {
      const { data: ar } = await supabase
        .from('artists')
        .select('name')
        .eq('id', tr.artist_id)
        .maybeSingle();
      artistName = ar?.name ?? null;
    }

    const item = {
      id: tr.id,
      title: tr.title || `نشيد رقم ${idNum}`,
      year: albumYear,
      cover_url: albumCover,
      album: albumTitle,
      artist: artistName,
      lyrics: (tr.lyrics ?? '') as string,
    };

    // نُبقي حقل lyrics لأجل التوافق القديم + نعطي item كامل
    return res.status(200).json({ ...basic, item, ok: true });
  } catch (e: any) {
    // إن كان الخطأ من البيئة غيّر الرسالة لتوضيح السبب
    const msg = e?.message || 'server error';
    const status = msg.includes('Supabase env missing') ? 500 : 500;
    return res.status(status).json({ error: msg });
  }
}
