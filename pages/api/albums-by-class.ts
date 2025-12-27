import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type ClassRow = { id: number; parent_id: number | null };

let cachedTree: { at: number; rows: ClassRow[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function getClassesTree(): Promise<ClassRow[]> {
  const now = Date.now();
  if (cachedTree && (now - cachedTree.at) < CACHE_MS) return cachedTree.rows;

  const { data, error } = await supabase
    .from('classes')
    .select('id,parent_id');

  if (error) throw error;

  const rows = (data ?? []) as any as ClassRow[];
  cachedTree = { at: now, rows };
  return rows;
}

function subtreeIds(rows: ClassRow[], rootId: number): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    const pid = r.parent_id ?? -1;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(r.id);
  }

  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();

  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);

    const ch = children.get(cur) ?? [];
    for (const c of ch) stack.push(c);
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const classId = parseInt(String(req.query.class_id ?? ''), 10);
    if (!Number.isFinite(classId)) {
      return res.status(200).json({ count: 0, items: [], error: 'missing/invalid class_id' });
    }

    const limit  = Math.min(parseInt(String(req.query.limit ?? '60'), 10) || 60, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const rows = await getClassesTree();
    const ids = subtreeIds(rows, classId);

    // count
    const { count, error: errCount } = await supabase
      .from('albums')
      .select('id', { head: true, count: 'exact' })
      .in('class_id', ids);

    if (errCount) throw errCount;

    // page
    const { data, error: errData } = await supabase
      .from('albums')
      .select('id,title,year,cover_url,info,class_id')
      .in('class_id', ids)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (errData) throw errData;

    res.status(200).json({ count: count ?? 0, items: data ?? [] });
  } catch (err: any) {
    res.status(200).json({ count: 0, items: [], error: err?.message || String(err) });
  }
}
