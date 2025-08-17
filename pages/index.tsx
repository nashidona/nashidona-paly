import React, { useEffect, useRef, useState } from 'react';

type Track = {
  id: number|string;
  title: string;
  album?: string;
  artist?: string;
  artist_text?: string;
  class_parent?: string;
  class_child?: string;
  cover_url?: string;
  year?: string;
  has_lyrics?: boolean;
};
type LoopMode = 'none'|'queue'|'one';

function fmt(sec: number) { if (!isFinite(sec) || sec < 0) return '0:00'; const m = Math.floor(sec/60); const s = Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }
function useDebounced<T>(value: T, delay = 300) { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]); return v; }
function shuffle<T>(arr: T[]) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

function setMediaSession(tr: {id:any; title:string; artist?:string; album?:string; cover_url?:string}, a?: HTMLAudioElement) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const cover = tr.cover_url || '/logo.png';
  const art = [
    { src: cover, sizes: '96x96',   type: 'image/png' },
    { src: cover, sizes: '192x192', type: 'image/png' },
    { src: cover, sizes: '512x512', type: 'image/png' },
  ];
  // @ts-ignore
  navigator.mediaSession.metadata = new MediaMetadata({ title: tr.title, artist: tr.artist || '', album: tr.album || '', artwork: art as any });
  const play = () => a?.play().catch(()=>{});
  const pause = () => a?.pause();
  // @ts-ignore
  navigator.mediaSession.setActionHandler('play', play);
  // @ts-ignore
  navigator.mediaSession.setActionHandler('pause', pause);
  // @ts-ignore
  navigator.mediaSession.setActionHandler('previoustrack', () => (window as any).__playPrev?.());
  // @ts-ignore
  navigator.mediaSession.setActionHandler('nexttrack', () => (window as any).__playNext?.());
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekbackward', (d:any)=>{ if(!a) return; a.currentTime = Math.max(0, a.currentTime - (d?.seekOffset||10));});
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekforward', (d:any)=>{ if(!a) return; a.currentTime = Math.min(a.duration||0, a.currentTime + (d?.seekOffset||10));});
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekto', (d:any)=>{ if(!a || d.fastSeek) return; a.currentTime = d.seekTime || 0;});
  // @ts-ignore
  if (a && ('setPositionState' in (navigator as any).mediaSession)) {
    // @ts-ignore
    (navigator as any).mediaSession.setPositionState({ duration: a.duration || 0, position: a.currentTime || 0, playbackRate: a.playbackRate || 1 });
  }
}

export default function Home() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);

  const [items, setItems] = useState<Track[]>([]);
  const [count, setCount] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [albumInfo, setAlbumInfo] = useState<string>('');

  // UI + audio state
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [showLyrics, setShowLyrics] = useState<{open:boolean, title?:string, text?:string}>({open:false});

  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [loop, setLoop] = useState<LoopMode>('queue');
  const [sleepAt, setSleepAt] = useState<number|null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayPending = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  // hydrate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawQueue = localStorage.getItem('nd_queue');
      const qArr: Track[] = rawQueue ? JSON.parse(rawQueue) : [];
      setQueue(Array.isArray(qArr) ? qArr : []);

      const rawCur = localStorage.getItem('nd_current');
      const curId = rawCur ? JSON.parse(rawCur) : null;
      if (curId && Array.isArray(qArr)) {
        const found = qArr.find(x => String(x.id) === String(curId)) || null;
        setCurrent(found);
      }

      const rawLoop = localStorage.getItem('nd_loop') as LoopMode | null;
      if (rawLoop === 'none' || rawLoop === 'queue' || rawLoop === 'one') setLoop(rawLoop);
      const rawSleep = localStorage.getItem('nd_sleep');
      if (rawSleep) setSleepAt(JSON.parse(rawSleep));
    } catch {}
  }, []);

  function dedup(arr: Track[]) {
    const seen = new Set<string>();
    return arr.filter(x => { const k = String(x.id); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async function fetchPage(newOffset = 0, append = false) {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${newOffset}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const page = dedup(j.items || []);
      setCount(typeof j.count === 'number' ? j.count : count);
      setHasMore((page.length === 60) || (typeof j.count === 'number' ? (newOffset + page.length) < j.count : page.length > 0));
      setItems(prev => append ? dedup([...prev, ...page]) : page);
    } catch (e:any) {
      setErr('تعذر جلب النتائج الآن'); if (!append) setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  // أول تحميل:
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOffset(0);
      setHasMore(true);
      setErr('');
      if (dq.trim() === '') {
        // عشوائي + خلط بصري
        let initialRandomCount = 0;
        try {
          const r = await fetch(`/api/random?limit=60`);
          const j = await r.json();
          const arr = Array.isArray(j.items) ? j.items : [];
          initialRandomCount = arr.length;
          if (!cancelled) {
            setItems(dedup(shuffle(arr)));
          }
        } catch {
          if (!cancelled) { setItems([]); setErr('تعذر جلب النتائج الآن'); setHasMore(false); }
        }
        // نقرأ العدد الحقيقي لتمكين التمرير
        try {
          const r2 = await fetch(`/api/search?q=&limit=1&offset=0`);
          const j2 = await r2.json();
          if (!cancelled) {
            setCount(j2.count || 0);
            setHasMore((j2.count || 0) > initialRandomCount);
          }
        } catch {}
      } else {
        await fetchPage(0,false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  // تمرير لا نهائي
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !loading && hasMore) {
          const next = offset + 60;
          setOffset(next);
          fetchPage(next, true);
        }
      });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { io.disconnect(); };
  }, [offset, loading, hasMore, dq]);

  // قفل التمرير عند فتح القائمة
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // keyboard offset
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const onResize = () => {
      const diff = vv.height ? Math.round(window.innerHeight - vv.height) : 0;
      const kb = diff > 60 ? diff : 0;
      document.documentElement.style.setProperty('--kb', kb + 'px');
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // footer height -> bottom padding
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const measure = () => {
      const h = footerRef.current?.getBoundingClientRect().height || 140;
      document.documentElement.style.setProperty('--footerH', `${Math.round(h)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (footerRef.current) ro.observe(footerRef.current);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, []);

  // ====== Queue/Player logic ======
  function playNow(tr: Track) {
    setCurrent(tr);
    setQueue(q => (q.find(x => String(x.id) === String(tr.id)) ? q : [tr, ...q]));
    autoPlayPending.current = true;
    setMediaSession({ ...tr, artist: tr.artist || tr.artist_text }, audioRef.current!);
  }
  function addToQueue(tr: Track) { setQueue(q => (q.find(x => String(x.id) === String(tr.id)) ? q : [...q, tr])); }
  function clearQueue() { setQueue([]); setCurrent(null); }
  function removeFromQueue(id: Track['id']) { setQueue(q => q.filter(x => String(x.id) !== String(id))); if (current && String(current.id) === String(id)) setTimeout(() => playNext(true), 0); }
  function move(id: Track['id'], dir: -1|1) { setQueue(q => { const i = q.findIndex(x => String(x.id) === String(id)); if (i < 0) return q; const j = i + dir; if (j < 0 || j >= q.length) return q; const c=[...q]; const tmp=c[i]; c[i]=c[j]; c[j]=tmp; return c; }); }
  function shuffleQueue() { setQueue(q => { const c=[...q]; for (let i=c.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [c[i],c[j]]=[c[j],c[i]];} return c; }); }
  function playNext(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const next = (idx >= 0 && idx < q.length - 1) ? q[idx + 1] : q[0]; setCurrent(next); if (autoplay) autoPlayPending.current = true; setMediaSession({ ...next, artist: next.artist || next.artist_text }, audioRef.current!); return q; }); }
  function playPrev(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const prev = (idx > 0) ? q[idx - 1] : q[q.length - 1]; setCurrent(prev); if (autoplay) autoPlayPending.current = true; setMediaSession({ ...prev, artist: prev.artist || prev.artist_text }, audioRef.current!); return q; }); }
  function seek(v: number) { const a = audioRef.current; if (!a) return; a.currentTime = v; setT(v); }

  // media keys
  useEffect(()=>{ if (typeof window === 'undefined') return; (window as any).__playNext = ()=>playNext(true); (window as any).__playPrev = ()=>playPrev(true); }, [queue, current]);

  // audio events
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => {
      setT(a.currentTime || 0);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && 'setPositionState' in (navigator as any).mediaSession) {
        (navigator as any).mediaSession.setPositionState({ duration: a.duration || 0, position: a.currentTime || 0, playbackRate: a.playbackRate || 1 });
      }
      if (sleepAt && Date.now() >= sleepAt) { a.pause(); setSleepAt(null); }
    };
    const onMeta = () => { setDur(a.duration || 0); if (autoPlayPending.current) { a.play().catch(()=>{}); autoPlayPending.current = false; } };
    const onEnd = () => {
      if (loop === 'one') { a.currentTime = 0; a.play().catch(()=>{}); return; }
      if (loop === 'queue') { playNext(true); return; }
      setT(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd); };
  }, [current, queue, loop, sleepAt]);

  // persist
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_queue', JSON.stringify(queue)); } catch {} }, [queue]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_current', JSON.stringify(current?.id ?? null)); } catch {} }, [current]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_loop', loop); } catch {} }, [loop]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_sleep', JSON.stringify(sleepAt)); } catch {} }, [sleepAt]);

  function startSleep(minutes:number){ const when = Date.now() + minutes*60*1000; setSleepAt(when); }

  // إضافة كل النتائج إلى القائمة
  async function addAllResultsToQueue() {
    // في العشوائي: أضف المعروض
    if (dq.trim() === '') {
      if (!items.length) return;
      setQueue(q => {
        const seen = new Set(q.map(x => String(x.id)));
        const merged = [...q];
        items.forEach(tr => { const k = String(tr.id); if (!seen.has(k)) { merged.push(tr); seen.add(k); } });
        return merged;
      });
      alert(`تمت إضافة ${items.length} إلى قائمة التشغيل`);
      return;
    }

    // في البحث: اجلب صفحات حتى 200 عنصر
    const total = count || 0;
    const cap = Math.min(total || 200, 200);
    if (cap <= 0) return;
    if (cap > 120 && !confirm(`سيتم إضافة ${cap} أنشودة إلى القائمة. هل أنت متأكد؟`)) return;

    let all = [...items];
    const maxLoops = 20; // أمان
    for (let loop=0, next=0; all.length < cap && loop < maxLoops; loop++, next += 60) {
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${next}`);
      if (!r.ok) break;
      const j = await r.json();
      const page = Array.isArray(j.items) ? j.items : [];
      if (!page.length) break;
      all = dedup([...all, ...page]);
    }
    const slice = all.slice(0, cap);
    setQueue(q => {
      const seen = new Set(q.map(x => String(x.id)));
      const merged = [...q];
      slice.forEach(tr => { const k = String(tr.id); if (!seen.has(k)) { merged.push(tr); seen.add(k); } });
      return merged;
    });
    alert(`تمت إضافة ${slice.length} إلى قائمة التشغيل`);
  }

  // جلب كلمات عند الطلب
  async function openLyrics(tr: Track) {
    try {
      const r = await fetch(`/api/track?id=${tr.id}`);
      const j = await r.json();
      const errText = (j && j.error) ? String(j.error) : '';
      const txt = (j?.lyrics || '').trim();
      setShowLyrics({open:true, title: tr.title, text: errText ? errText : (txt || 'لا توجد كلمات متاحة.')});
    } catch {
      setShowLyrics({open:true, title: tr.title, text: 'تعذر جلب الكلمات حالياً.'});
    }
  }

  // بانر معلومات الألبوم عندما تكون النتائج محصورة لألبوم واحد
  const singleAlbum = (() => {
    if (!items.length) return null;
    const uniq = Array.from(new Set(items.map(x => x.album || '')));
    if (uniq.length === 1 && uniq[0]) {
      const sample = items[0];
      return { title: uniq[0], year: sample.year || '', cover: sample.cover_url || '/logo.png' };
    }
    return null;
  })();

  // جلب info للألبوم
  useEffect(() => {
    let cancelled = false;
    if (singleAlbum?.title) {
      fetch(`/api/album?title=${encodeURIComponent(singleAlbum.title)}`)
        .then(r => r.json())
        .then(j => { if (!cancelled) setAlbumInfo((j?.info || '').trim()); })
        .catch(() => { if (!cancelled) setAlbumInfo(''); });
    } else {
      setAlbumInfo('');
    }
    return () => { cancelled = true; };
  }, [singleAlbum?.title]);

  // واجهة
  return (<div style={{fontFamily:'system-ui,-apple-system,Segoe UI,Tahoma',background:'#f8fafc',minHeight:'100vh'}}>
    <header style={{position:'sticky',top:0,background:'#fff',borderBottom:'1px solid #e5e7eb',zIndex:10}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <img src='/logo.png' width={36} height={36} alt='logo'/><b>Nashidona • النسخة التجريبية</b>
        </div>
        <div className='stats' style={{fontSize:12,color:'#6b7280'}}>النتائج: {items.length}{count? ` / ${count}`:''}</div>
      </div>
    </header>

    <section style={{maxWidth:960,margin:'20px auto 12px auto',padding:'12px 16px'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder='ماذا تحب أن تسمع؟ اكتب اسم نشيد/منشد/ألبوم...'
               style={{padding:'14px 16px',border:'2px solid #d1fae5',borderRadius:12,width:'100%',maxWidth:680,fontSize:18}} autoFocus/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
          <button onClick={addAllResultsToQueue} style={{padding:'8px 10px',border:'1px solid #d1fae5',borderRadius:8}}>+ إضافة النتائج إلى القائمة</button>
        </div>
      </div>
      {singleAlbum && (
        <div style={{maxWidth:960,margin:'14px auto 0',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:12,background:'#fff',display:'flex',gap:10,alignItems:'center'}}>
          <img src={singleAlbum.cover} width={48} height={48} style={{borderRadius:10,objectFit:'cover'}} alt=''/>
          <div style={{lineHeight:1.4}}>
            <div style={{fontWeight:700,color:'#064e3b'}}>ألبوم: {singleAlbum.title}</div>
            <div style={{fontSize:12,color:'#047857'}}>{singleAlbum.year ? `السنة: ${singleAlbum.year}` : ''}</div>
            {albumInfo && (
              <div style={{fontSize:12,color:'#374151',marginTop:4,whiteSpace:'pre-wrap'}}>{albumInfo}</div>
            )}
          </div>
        </div>
      )}
      {err && <div style={{color:'#dc2626',textAlign:'center',marginTop:8}}>{err}</div>}
    </section>

    <main style={{maxWidth:960,margin:'0 auto',padding:'0 16px calc(var(--footerH,160px) + var(--kb,0)) 16px'}}>
      <div style={{display:'grid',gap:12}}>
        {items.map(tr=>(
          <div key={String(tr.id)} className='trackCard'
               style={{display:'flex',justifyContent:'space-between',alignItems:'stretch',
                       flexWrap:'wrap',gap:8,border:'1px solid #e5e7eb',borderRadius:12,
                       padding:12,background:'#fff'}}>
            {/* صورة يمين + نص يسار (RTL) */}
            <div className='trackRow'
                 style={{display:'flex',flexDirection:'row-reverse',alignItems:'flex-start',
                         gap:12,minWidth:0,flex:1}}>
              <img loading='lazy' src={tr.cover_url || '/logo.png'} width={54} height={54}
                   style={{objectFit:'cover',borderRadius:10,flex:'0 0 54px'}} alt=''/>

              <div className='trackMeta' style={{minWidth:0,flex:1}}>
                <div className='trackTitle' title={tr.title}
                     style={{color:'#064e3b',fontWeight:700,lineHeight:1.35, display:'flex',alignItems:'center',gap:6}}>
                  <span style={{display:'inline'}}>{tr.title}</span>
                  {tr.has_lyrics ? <button className='lyricsIcon' title='كلمات' onClick={()=>openLyrics(tr)}>🎼</button> : null}
                </div>

                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',margin:'6px 0'}}>
                  {/* Chips: القسم الرئيسي/الفرعي */}
                  {tr.class_parent && <span role='button' onClick={()=>setQ(tr.class_parent || '')} className='chip'>{tr.class_parent}</span>}
                  {tr.class_child  && <span role='button' onClick={()=>setQ(tr.class_child  || '')} className='chip'>{tr.class_child}</span>}
                </div>

                {/* سطر الألبوم/المنشد/السنة */}
                <div className='trackSub' style={{fontSize:13,color:'#047857',lineHeight:1.35}}>
                  {tr.album ? <span role='button' onClick={()=>setQ(tr.album || '') } className='linkish'>الألبوم: {tr.album}</span> : '—'}
                  {tr.year ? <span> • {tr.year}</span> : null}
                  <br/>
                  {(tr.artist || tr.artist_text)
                    ? <span role='button' onClick={()=>setQ((tr.artist||tr.artist_text) || '')} className='linkish'>
                        المنشد: {tr.artist || tr.artist_text}
                      </span>
                    : <span style={{color:'#6b7280'}}>—</span>
                  }
                </div>
              </div>
            </div>

            <div className='actions' style={{display:'flex',gap:8}}>
              <button className='btn-queue' onClick={()=>addToQueue(tr)} style={{padding:'8px 10px',border:'1px solid #d1fae5',borderRadius:8}}>+ قائمة</button>
              <button className='btn-play' onClick={()=>{playNow(tr);}} style={{padding:'8px 10px',background:'#059669',color:'#fff',borderRadius:8}}>▶ تشغيل</button>
            </div>
          </div>
        ))}
      </div>
      <div ref={sentinelRef} style={{height:1}}/>
    </main>

    <footer ref={footerRef} style={{position:'fixed',bottom:'var(--kb,0)',left:0,right:0,background:'#ffffffee',backdropFilter:'blur(8px)',borderTop:'1px solid #e5e7eb',zIndex:40}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'10px 12px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={()=>playPrev(true)} title='السابق'>⏮</button>
          <button onClick={()=>{const a=audioRef.current;if(!a)return;if(a.paused)a.play();else a.pause();}} title='تشغيل/إيقاف'>⏯</button>
          <button onClick={()=>playNext(true)} title='التالي'>⏭</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:220}}>
          <span style={{width:42,textAlign:'left',fontVariantNumeric:'tabular-nums'}}>{fmt(t)}</span>
          <input type='range' min={0} max={Math.max(1,dur)} step={1} value={Math.min(t,dur||0)} onChange={(e)=>{const v=parseFloat(e.target.value); const a=audioRef.current; if(a){a.currentTime=v;} setT(v);}} style={{flex:1}}/>
          <span style={{width:42,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(dur)}</span>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={() => setLoop(l => l==='none' ? 'queue' : l==='queue' ? 'one' : 'none')}
                  title={`نمط التكرار: ${loop==='none'?'بدون':loop==='queue'?'القائمة':'المسار'}`}>
            {loop==='none'?'⏹':loop==='queue'?'🔁':'🔂'}
          </button>
          <button onClick={shuffleQueue} title='خلط القائمة'>🔀</button>
          <select onChange={e => { const m = parseInt(e.target.value, 10); if (m>0) startSleep(m); }}
                  defaultValue="0" title="مؤقّت النوم">
            <option value="0">بدون مؤقّت</option>
            <option value="15">15د</option>
            <option value="30">30د</option>
            <option value="60">60د</option>
          </select>
        </div>
        <button onClick={()=>setOpen(true)} onTouchEnd={()=>setOpen(true)} aria-expanded={open}
                style={{padding:'6px 10px',border:'1px solid #d1fae5',borderRadius:8}}>
          قائمة ({queue.length})
        </button>
        <audio ref={audioRef} src={current? `/api/stream/${current.id}`: undefined} preload='metadata'/>
      </div>
    </footer>

    {/* قائمة التشغيل (مع سحب وإفلات) */}
    {open && (
      <div className='sheet' onClick={()=>setOpen(false)}>
        <div className='panel' onClick={(e)=>e.stopPropagation()}>
          <div className='handle'/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8, gap:8, flexWrap:'wrap'}}>
            <b>قائمة التشغيل</b>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={() => setLoop(l => l==='none' ? 'queue' : l==='queue' ? 'one' : 'none')}
                      title={`نمط التكرار: ${loop==='none'?'بدون':loop==='queue'?'القائمة':'المسار'}`}>
                {loop==='none'?'⏹':loop==='queue'?'🔁':'🔂'}
              </button>
              <button onClick={shuffleQueue} title='خلط القائمة'>🔀</button>
              <select onChange={e => { const m = parseInt(e.target.value, 10); if (m>0) startSleep(m); }}
                      defaultValue="0" title="مؤقّت النوم">
                <option value="0">بدون مؤقّت</option>
                <option value="15">15د</option>
                <option value="30">30د</option>
                <option value="60">60د</option>
              </select>
            </div>
            <div style={{display:'flex',gap:8,marginInlineStart:'auto'}}>
              <button onClick={()=>setOpen(false)}>إغلاق</button>
              <button onClick={clearQueue} disabled={!queue.length}>تفريغ الكل</button>
            </div>
          </div>
          <div style={{display:'grid',gap:8,maxHeight:'56vh',overflowY:'auto'}}>
            {queue.map((tr,i)=>(
              <div key={String(tr.id)}
                   draggable
                   onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(i)); }}
                   onDragOver={(e)=>e.preventDefault()}
                   onDrop={(e)=>{ const from = parseInt(e.dataTransfer.getData('text/plain'),10); const to = i;
                                  setQueue(q => { const c=[...q]; const [it]=c.splice(from,1); c.splice(to,0,it); return c; }); }}
                   style={{display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #e5e7eb',
                           borderRadius:10,padding:'6px 8px',
                           background: current&&String(current.id)===String(tr.id)? '#ecfdf5':'#fff'}}>
                <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tr.title}>{tr.title}</div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>move(tr.id,-1)} disabled={i===0} title='أعلى'>⬆</button>
                  <button onClick={()=>move(tr.id,+1)} disabled={i===queue.length-1} title='أسفل'>⬇</button>
                  <button onClick={()=>removeFromQueue(tr.id)} title='حذف'>✕</button>
                  <button onClick={()=>{setCurrent(tr);}} title='تشغيل'>▶</button>
                </div>
              </div>
            ))}
            {!queue.length && <div style={{color:'#6b7280'}}>لا يوجد عناصر بعد. أضف من النتائج أعلاه.</div>}
          </div>
        </div>
      </div>
    )}

    {/* لوحة كلمات النشيد */}
    {showLyrics.open && (
      <div className='sheet' onClick={()=>setShowLyrics({open:false})}>
        <div className='panel' onClick={(e)=>e.stopPropagation()}>
          <div className='handle'/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <b>كلمات: {showLyrics.title || ''}</b>
            <button onClick={()=>setShowLyrics({open:false})}>إغلاق</button>
          </div>
          <div style={{maxHeight:'56vh',overflowY:'auto',whiteSpace:'pre-wrap',lineHeight:1.7}}>
            {showLyrics.text || '—'}
          </div>
        </div>
      </div>
    )}

    <style jsx global>{`
      *,*::before,*::after{ box-sizing:border-box }
      html,body{ max-width:100%; overflow-x:hidden; margin:0 }
      img,video,canvas{ max-width:100%; height:auto; display:block }
      footer{ left:0; right:0; transform:translateZ(0) }

      .chip{
        font-size:12px; padding:4px 8px; border:1px solid #d1fae5; border-radius:999px; background:#f0fdf4; color:#065f46; cursor:pointer;
      }
      .chip:hover{ background:#dcfce7 }
      .linkish{ cursor:pointer; text-decoration:underline; text-underline-offset:3px }

      .trackCard { width:100%; }
      .trackCard > * { min-width:0; }
      .trackRow > * { min-width:0; }
      .trackTitle, .trackSub {
        white-space: normal;
        word-break: break-word;
        overflow-wrap: anywhere;
        display: block;
      }
      .lyricsIcon {
        border:1px solid #e5e7eb; border-radius:6px; padding:2px 6px; font-size:12px; background:#fff; cursor:pointer;
      }

      @media (max-width: 520px) {
        .trackCard { flex-direction: column; align-items: stretch; width:100%; }
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
  </div>);
}
