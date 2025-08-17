
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Track = {
  id: number|string;
  title: string;
  album?: string;
  album_id?: number|string;
  artist?: string;
  artist_id?: number|string;
  cover_url?: string;
  url: string;
  year?: string|number;
  class_main?: string;
  class_sub?: string;
  has_lyrics?: boolean;
  lyrics?: string;
  lyrics_url?: string;
};

type LoopMode = 'none'|'queue'|'one';

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function useDebounced<T>(value: T, delay=300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function setMediaSession(tr: Track, a?: HTMLAudioElement|null) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const art = tr.cover_url ? [
    { src: tr.cover_url, sizes: '96x96', type: 'image/png' },
    { src: tr.cover_url, sizes: '192x192', type: 'image/png' },
    { src: tr.cover_url, sizes: '512x512', type: 'image/png' },
  ] : [{ src: '/logo.png', sizes: '192x192', type: 'image/png' } as any];
  (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
    title: tr.title || 'نشيد',
    artist: tr.artist || '',
    album: tr.album || '',
    artwork: art
  });
  if (a) {
    (navigator as any).mediaSession.setActionHandler('previoustrack', () => (a as any).__playPrev?.());
    (navigator as any).mediaSession.setActionHandler('nexttrack', () => (a as any).__playNext?.());
    (navigator as any).mediaSession.setActionHandler('play', () => a.play());
    (navigator as any).mediaSession.setActionHandler('pause', () => a.pause());
    (navigator as any).mediaSession.setActionHandler('seekto', (d: any) => { try { a.currentTime = d.seekTime ?? a.currentTime; } catch {} });
  }
}

export default function Home() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [items, setItems] = useState<Track[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [classFilter, setClassFilter] = useState<{main?:string, sub?:string}>({});

  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<number>(-1);
  const [loop, setLoop] = useState<LoopMode>('none');
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);
  const [open, setOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState<Track|null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [preShuffle, setPreShuffle] = useState<Track[]|null>(null);

  const audioRef = useRef<HTMLAudioElement|null>(null);
  const listRef = useRef<HTMLDivElement|null>(null);
  const sentinelRef = useRef<HTMLDivElement|null>(null);
  const footerRef = useRef<HTMLElement|null>(null);

  useEffect(() => {
    // initial load random tracks
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/random?limit=60`);
        const j = await r.json();
        setItems(j.items || []);
        setCount((j.items||[]).length);
        setOffset(0);
      } catch (e:any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    // lock scroll when queue sheet is open
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  async function fetchPage(start=0, append=false) {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${start}`);
      const j = await r.json();
      const newItems: Track[] = j.items || [];
      if (append) setItems(prev => [...prev, ...newItems]);
      else setItems(newItems);
      setCount(j.count ?? newItems.length ?? 0);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // new search
    if (dq === '') {
      // show random
      (async () => {
        const r = await fetch(`/api/random?limit=60`);
        const j = await r.json();
        setItems(j.items || []);
        setCount((j.items||[]).length);
        setOffset(0);
      })();
    } else {
      setOffset(0);
      fetchPage(0, false);
    }
    // reset class filter when user types
    setClassFilter({});
  }, [dq]);

  useEffect(() => {
    // infinite scroll observer
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !loading) {
          const next = offset + 60;
          setOffset(next);
          if (dq) fetchPage(next, true);
          else {
            // random pagination
            (async () => {
              const r = await fetch(`/api/random?limit=60`);
              const j = await r.json();
              setItems(prev => [...prev, ...(j.items||[])]);
              setCount(prev => prev + (j.items||[]).length);
            })();
          }
        }
      });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [offset, loading, dq]);

  // queue helpers
  function playTrack(tr: Track, replace=false) {
    let idx = queue.findIndex(x => x.id === tr.id);
    let q2 = queue.slice();
    if (idx === -1) {
      if (replace) q2 = [tr];
      else q2.push(tr);
      idx = q2.length - 1;
      setQueue(q2);
    }
    setCurrent(idx);
    setOpen(true);
    setTimeout(() => {
      const a = audioRef.current;
      if (a) { (a as any).__playNext = () => playNext(true); (a as any).__playPrev = () => playPrev(true); }
    }, 0);
  }

  function addToQueue(tr: Track) {
    setQueue(q => {
      if (q.some(x => x.id === tr.id)) return q;
      return [...q, tr];
    });
  }

  function addAllVisibleWithWarning() {
    // visible items after optional classFilter
    const vis = filteredItems;
    // dedupe against queue
    const qIds = new Set(queue.map(x => String(x.id)));
    const toAdd = vis.filter(x => !qIds.has(String(x.id)));
    const M = toAdd.length;
    if (M === 0) { toast('كل العناصر موجودة مسبقًا في القائمة.'); return; }
    if (M > 100) {
      if (!confirm(`سيتم إضافة أول 100 من ${M} عنصرًا. المتابعة؟`)) return;
      toAdd.splice(100);
    } else if (M >= 30) {
      const all = confirm(`إضافة ${M} عنصرًا دفعة واحدة؟ قد يؤثر مؤقتًا على الأداء.\nموافق = إضافة الكل\nإلغاء = إضافة 30 فقط`);
      if (!all) toAdd.splice(30);
    }
    setQueue(q => {
      const combined = [...q];
      for (const tr of toAdd) combined.push(tr);
      toast(`أُضيف ${toAdd.length}، وتخطّينا ${M - toAdd.length} (موجودة).`);
      return combined;
    });
  }

  function toast(msg: string) {
    if (typeof window === 'undefined') return;
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:10px;z-index:1000;opacity:0;transition:.2s;';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(()=>el.remove(), 200); }, 2200);
  }

  function playNext(manual=false) {
    if (queue.length === 0) return;
    if (loop === 'one' && !manual) { const a = audioRef.current; if (a) a.currentTime = 0; return; }
    if (current < queue.length - 1) setCurrent(current + 1);
    else if (loop === 'queue') setCurrent(0);
  }
  function playPrev(manual=false) {
    if (queue.length === 0) return;
    if (loop === 'one' && !manual) { const a = audioRef.current; if (a) a.currentTime = 0; return; }
    if (current > 0) setCurrent(current - 1);
    else if (loop === 'queue') setCurrent(queue.length - 1);
  }

  // shuffle while keeping current in place
  function toggleShuffle() {
    setShuffle(s => {
      if (!s) {
        setPreShuffle(queue.slice());
        if (current >= 0) {
          const cur = queue[current];
          const rest = queue.filter((_,i)=>i!==current);
          for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          const newQ = [...rest.slice(0,current), cur, ...rest.slice(current)];
          setQueue(newQ);
        } else {
          const rest = queue.slice();
          for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          setQueue(rest);
        }
        return true;
      } else {
        if (preShuffle) setQueue(preShuffle);
        setPreShuffle(null);
        return false;
      }
    });
  }

  // DnD
  const dragIndex = useRef<number|null>(null);
  function onDragStart(i:number) { dragIndex.current = i; }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(i:number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from==null || from===i) return;
    setQueue(q => {
      const ret = q.slice();
      const [moved] = ret.splice(from,1);
      ret.splice(i,0,moved);
      return ret;
    });
    if (current === from) setCurrent(i);
    else if (current > from && current <= i) setCurrent(current - 1);
    else if (current < from && current >= i) setCurrent(current + 1);
  }

  // filtered by class chips (client-side fallback)
  const filteredItems = useMemo(() => {
    let arr = items;
    if (classFilter.main) arr = arr.filter(x => (x.class_main||'').toLowerCase() === classFilter.main!.toLowerCase());
    if (classFilter.sub) arr = arr.filter(x => (x.class_sub||'').toLowerCase() === classFilter.sub!.toLowerCase());
    return arr;
  }, [items, classFilter]);

  // album banner detection
  const albumMeta = useMemo(() => {
    const uniq = new Map<string, {title:string, year?:string|number, cover?:string}>();
    for (const it of filteredItems) {
      if (!it.album) continue;
      const key = it.album;
      if (!uniq.has(key)) uniq.set(key, { title: it.album, year: it.year, cover: it.cover_url });
    }
    if (uniq.size === 1) return Array.from(uniq.values())[0];
    return null;
  }, [filteredItems]);

  // handle chip click fill search or set class filter
  function onChipClick(kind: 'artist'|'album'|'class_main'|'class_sub', value?: string) {
    if (!value) return;
    if (kind === 'class_main') { setClassFilter({ main: value }); setQ(value); return; }
    if (kind === 'class_sub') { setClassFilter(f => ({ main: f.main, sub: value })); setQ(value); return; }
    setQ(value);
  }

  useEffect(() => {
    // install mediaSession handlers for current track
    const a = audioRef.current;
    if (!a || current<0 || current>=queue.length) return;
    setMediaSession(queue[current], a);
  }, [current, queue]);

  return (
  <div>
    <header style={{position:'sticky', top:0, zIndex:30, background:'#fff', borderBottom:'1px solid #eee'}}>
      <div style={{maxWidth:960, margin:'0 auto', padding:'12px 12px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
        <img src="/logo.png" width={28} height={28} alt="logo" style={{borderRadius:6}} onError={(e)=>{(e.currentTarget as any).src='/logo.png';}}/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن أنشودة / منشد / ألبوم..." style={{flex:1, minWidth:200, padding:'10px 12px', borderRadius:10, border:'1px solid #e5e7eb'}}/>
        <button onClick={()=>addAllVisibleWithWarning()} title="إضافة كل النتائج" style={{padding:'10px 12px', borderRadius:10, border:'1px solid #e5e7eb', background:'#f8fafc'}}>➕ إضافة الكل</button>
        <div className="stats" style={{fontSize:12, color:'#64748b'}}>{filteredItems.length} / {count} نتيجة</div>
        <button className="btn-queue" onClick={()=>setOpen(true)} style={{padding:'8px 10px', borderRadius:10, border:'1px solid #e5e7eb'}}>القائمة ({queue.length})</button>
      </div>
    </header>

    <main style={{maxWidth:960, margin:'0 auto', padding:'12px'}} ref={listRef}>
      {albumMeta && (
        <div style={{display:'flex', alignItems:'center', gap:12, background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:12, padding:10, marginBottom:10}}>
          <img src={albumMeta.cover || '/logo.png'} width={56} height={56} style={{borderRadius:8, objectFit:'cover'}} onError={(e)=>{(e.currentTarget as any).src='/logo.png';}} alt=""/>
          <div style={{display:'flex', flexDirection:'column'}}>
            <b>{albumMeta.title}</b>
            {albumMeta.year ? <span style={{fontSize:12, color:'#64748b'}}>سنة الإصدار: {albumMeta.year}</span> : null}
          </div>
        </div>
      )}

      <div className="grid">
        {filteredItems.map((it, i) => (
          <div key={String(it.id)+'_'+i} className="card">
            <div className="media">
              <img src={it.cover_url || '/logo.png'} alt="" onError={(e)=>{(e.currentTarget as any).src='/logo.png';}}/>
            </div>
            <div className="meta">
              <div className="title" title={it.title}>{it.title}</div>
              <div className="sub">
                {it.artist && <a onClick={()=>onChipClick('artist', it.artist)} style={{cursor:'pointer'}}>{it.artist}</a>}
                {it.album && <>
                  <span> • </span>
                  <a onClick={()=>onChipClick('album', it.album)} style={{cursor:'pointer'}}>{it.album}</a>
                </>}
              </div>
              <div className="chips">
                {it.class_main && <span className="chip" onClick={()=>onChipClick('class_main', it.class_main)}>{it.class_main}</span>}
                {it.class_sub  && <span className="chip" onClick={()=>onChipClick('class_sub', it.class_sub)}>{it.class_sub}</span>}
                {it.has_lyrics || it.lyrics || it.lyrics_url ? <span className="chip ghost" onClick={()=>setLyricsOpen(it)}>كلمات</span> : null}
              </div>
              <div className="actions">
                <button className="btn-play" onClick={()=>playTrack(it)}>▶ تشغيل</button>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={()=>addToQueue(it)} title="إضافة إلى القائمة">➕</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div ref={sentinelRef} style={{height:1}}/>
      {loading && <div style={{textAlign:'center', padding:20, color:'#64748b'}}>جاري التحميل…</div>}
      {error && <div style={{textAlign:'center', padding:20, color:'#ef4444'}}>خطأ: {error}</div>}
    </main>

    <footer ref={footerRef as any} style={{position:'fixed',bottom:'var(--safe-bottom, env(safe-area-inset-bottom))',left:0,right:0,background:'rgba(255,255,255,.88)',backdropFilter:'blur(8px)',borderTop:'1px solid #e5e7eb',zIndex:40}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'10px 12px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={()=>playPrev(true)} title='السابق'>⏮</button>
          <button onClick={()=>{const a=audioRef.current;if(!a)return;if(a.paused)a.play();else a.pause();}} title='تشغيل/إيقاف'>⏯</button>
          <button onClick={()=>playNext(true)} title='التالي'>⏭</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:220}}>
          <span style={{width:42,textAlign:'left',fontVariantNumeric:'tabular-nums'}}>{fmt(t)}</span>
          <input type='range' min={0} max={Math.max(1,dur)} step={1} value={t} onChange={e=>{const v=+e.target.value; const a=audioRef.current; if(a){a.currentTime=v;} setT(v);}} style={{flex:1}}/>
          <span style={{width:42,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(dur)}</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={()=>setLoop(loop==='none'?'queue':loop==='queue'?'one':'none')} title='وضع التكرار'>{loop==='none'?'🔁✕':loop==='queue'?'🔁 قائمة':'🔁 واحد'}</button>
          <button onClick={toggleShuffle} title='خلط'>{shuffle?'🔀 قيد التشغيل':'🔀'}</button>
          <button onClick={()=>setOpen(v=>!v)} title='فتح/إغلاق القائمة'>📜 {queue.length}</button>
        </div>
        <audio ref={audioRef} src={current>=0?(`/api/stream/${encodeURIComponent(String(queue[current]?.id))}`):undefined} preload='none'
          onLoadedMetadata={(e)=>{ setDur((e.target as HTMLAudioElement).duration||0); setMediaSession(queue[current], audioRef.current); }}
          onTimeUpdate={(e)=>{ setT((e.target as HTMLAudioElement).currentTime||0); }}
          onEnded={()=>playNext(false)}
          style={{display:'none'}}/>
      </div>
    </footer>

    {open && (
      <div className='sheet' onClick={()=>setOpen(false)}>
        <div className='panel' onClick={e=>e.stopPropagation()}>
          <div className='handle'/>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <b>قائمة التشغيل</b>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button onClick={toggleShuffle} title='خلط'>{shuffle?'🔀 قيد التشغيل':'🔀 خلط'}</button>
              <button onClick={()=>setQueue([])}>مسح</button>
            </div>
          </div>
          <div>
            {queue.map((tr, i) => (
              <div key={String(tr.id)+'q'} className='row' draggable onDragStart={()=>onDragStart(i)} onDragOver={onDragOver} onDrop={()=>onDrop(i)}>
                <span style={{cursor:'grab'}}>↕</span>
                <img src={tr.cover_url || '/logo.png'} width={38} height={38} style={{borderRadius:6, objectFit:'cover'}} onError={(e)=>{(e.currentTarget as any).src='/logo.png';}} alt=""/>
                <div style={{flex:1, minWidth:0}}>
                  <div className={'one'+(i===current?' playing':'')} title={tr.title} onClick={()=>{setCurrent(i); setOpen(false);}}>{tr.title}</div>
                  <div className='two'>
                    <span>{tr.artist}</span>
                    {tr.album && <><span> • </span><span>{tr.album}</span></>}
                  </div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={()=>{ setQueue(q=>q.filter((_,j)=>j!==i)); if (i<current) setCurrent(c=>c-1); else if (i===current) setCurrent(-1); }}>حذف</button>
                  <button onClick={()=>{ setCurrent(i); setOpen(false); }}>تشغيل</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {lyricsOpen && (
      <div className='sheet' onClick={()=>setLyricsOpen(null)}>
        <div className='panel' onClick={e=>e.stopPropagation()} style={{maxHeight:'70vh', overflow:'auto'}}>
          <div className='handle'/>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <img src={lyricsOpen.cover_url || '/logo.png'} width={42} height={42} style={{borderRadius:6}} onError={(e)=>{(e.currentTarget as any).src='/logo.png';}} alt=""/>
            <div><b>{lyricsOpen.title}</b><div style={{fontSize:12, color:'#64748b'}}>{lyricsOpen.artist||''}</div></div>
          </div>
          <div style={{direction:'rtl', marginTop:12, whiteSpace:'pre-wrap', lineHeight:1.9}}>
            {lyricsOpen.lyrics ? lyricsOpen.lyrics :
              (lyricsOpen.lyrics_url ? <a href={lyricsOpen.lyrics_url} target="_blank" rel="noreferrer">فتح الكلمات</a> :
              <i>لا تتوفر كلمات.</i>)}
          </div>
        </div>
      </div>
    )}

    <style jsx>{`
      .grid { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:10px; }
      @media (max-width: 640px) { .grid{ grid-template-columns: 1fr; } }
      .card { display:flex; gap:10px; border:1px solid #e5e7eb; border-radius:12px; padding:10px; background:#fff; }
      .card .media img { width:96px; height:96px; border-radius:10px; object-fit:cover; }
      .meta .title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .meta .sub { font-size:13px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .chips { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0; }
      .chip { padding:4px 8px; border:1px solid #e5e7eb; border-radius:999px; font-size:12px; cursor:pointer; user-select:none; }
      .chip.ghost { background:#f8fafc; }
      .actions { display:flex; gap:8px; align-items:center; }
      .btn-play { border:1px solid #22c55e; background:#22c55e; color:#fff; padding:6px 10px; border-radius:10px; }
      .row { display:flex; gap:8px; align-items:center; padding:6px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:6px; background:#fff; }
      .row .one { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
      .row .one.playing { color:#22c55e; }
      .row .two { font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      @media (max-width: 640px) {
        .grid { grid-template-columns: 1fr; }
        .actions { width:100%; display:grid !important; grid-template-columns: 1fr auto; gap:8px; }
        .btn-play { width:100%; }
        header .stats { display:none; }
      }
      .sheet{ position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.25); }
      .sheet .panel{
        position: absolute; left:0; right:0; bottom:0;
        background:#fff; border-top-left-radius:16px; border-top-right-radius:16px;
        padding: 10px; box-shadow: 0 -10px 30px rgba(0,0,0,.15);
        padding-bottom: calc(10px + env(safe-area-inset-bottom));
      }
      .sheet .handle{ width:44px; height:5px; background:#e5e7eb; border-radius:999px; margin:6px auto 10px; }
    `}</style>
  </div>
  );
}
