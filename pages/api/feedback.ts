import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// قد لا تكون المفاتيح مضبوطة على السيرفر المحلي
let supabase: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  try {
    const { message, email, ua, page, track_id } = (req.body || {});
    const msg = (message || '').toString().trim();
    if (!msg) { res.status(200).json({ ok:false, error:'empty_message' }); return; }

    // لو Supabase غير جاهز، نسجل في اللوج ونرجّع OK (حتى لا نفشل تجربة المستخدم)
    if (!supabase) {
      console.log('[feedback:fallback]', { msg, email: email || null, ua: ua || '', page: page || '', track_id: track_id ?? null });
      res.status(200).json({ ok: true, stored: 'console' });
      return;
    }

    // محاولة إدراج في جدول feedback (إن كان موجوداً)
    const { error } = await supabase.from('feedback').insert([{
      message: msg,
      email: email || null,
      ua: ua || '',
      page: page || '',
      track_id: track_id ?? null,
    }]);
    if (error) {
      // في حال عدم وجود الجدول أو أي خطأ: نسجّل في اللوج ونرجّع OK
      console.warn('[feedback:insert_error]', error);
      console.log('[feedback:fallback]', { msg, email: email || null, ua: ua || '', page: page || '', track_id: track_id ?? null });
      res.status(200).json({ ok: true, stored: 'console' });
      return;
    }

    res.status(200).json({ ok: true, stored: 'supabase' });
  } catch (e:any) {
    console.error('[feedback:error]', e);
    res.status(200).json({ ok:false, error: e?.message || String(e) });
  }
}
