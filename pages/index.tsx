
import React, { useEffect, useRef, useState } from 'react';

type Track = { id: number|string; title: string; album?: string; artist?: string; cover_url?: string; url: string; year?: string };
type LoopMode = 'none'|'queue'|'one';

function fmt(sec: number) { if (!isFinite(sec) || sec < 0) return '0:00'; const m = Math.floor(sec/60); const s = Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }
function useDebounced<T>(value: T, delay = 300) { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]); return v; }

function setMediaSession(tr: {id:any; title:string; artist?:string; album?:string; cover_url?:string}, a?: HTMLAudioElement) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const art = tr.cover_url ? [
    { src: tr.cover_url, sizes: '96x96',   type: 'image/png' },
    { src: tr.cover_url, sizes: '192x192', type: 'image/png' },
    { src: tr.cover_url, sizes: '512x512', type: 'image/png' },
  ] : [{ src: '/logo.png', sizes: '192x192', type: 'image/png' }];

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  // UI + audio state (declare early)
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  // SSR-safe initial states (hydrate later from localStorage)
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [loop, setLoop] = useState<LoopMode>('queue');
  const [sleepAt, setSleepAt] = useState<number|null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayPending = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // hydrate from localStorage on client
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

  async function fetchPage(newOffset = 0, append = false) {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${newOffset}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setCount(j.count || 0);
      setItems(prev => append ? [...prev, ...(j.items || [])] : (j.items || []));
    } catch (e:any) {
      setErr('تعذر جلب النتائج الآن'); if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // first load: random if query empty
  useEffect(() => {
    async function firstLoad(){
      if (dq.trim() === '') {
        try {
          const r = await fetch('/api/random?limit=60');
          const j = await r.json();
          if ((j.items || []).length) {
            setItems(j.items || []);
            setCount((j.items||[]).length);
            return;
          }
        } catch {}
      }
      setOffset(0);
      fetchPage(0,false);
    }
    firstLoad();
  }, [dq]);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !loading && items.length < count) {
          const next = offset + 60;
          setOffset(next);
          fetchPage(next, true);
        }
      });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { io.disconnect(); };
  }, [offset, loading, items.length, count, dq]);

  // body scroll lock when sheet open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Keyboard offset clamp
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

  function playNow(tr: Track) {
    setCurrent(tr);
    if (!queue.find(x => String(x.id) === String(tr.id))) setQueue(q => [tr, ...q]);
    autoPlayPending.current = true;
    setMediaSession(tr, audioRef.current!);
  }
  function addToQueue(tr: Track) { setQueue(q => (q.find(x => String(x.id) === String(tr.id)) ? q : [...q, tr])); }
  function clearQueue() { setQueue([]); setCurrent(null); }
  function removeFromQueue(id: Track['id']) { setQueue(q => q.filter(x => String(x.id) !== String(id))); if (current && String(current.id) === String(id)) setTimeout(() => playNext(true), 0); }
  function move(id: Track['id'], dir: -1|1) { setQueue(q => { const i = q.findIndex(x => String(x.id) === String(id)); if (i < 0) return q; const j = i + dir; if (j < 0 || j >= q.length) return q; const c=[...q]; const tmp=c[i]; c[i]=c[j]; c[j]=tmp; return c; }); }
  function playNext(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const next = (idx >= 0 && idx < q.length - 1) ? q[idx + 1] : q[0]; setCurrent(next); if (autoplay) autoPlayPending.current = true; setMediaSession(next, audioRef.current!); return q; }); }
  function playPrev(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const prev = (idx > 0) ? q[idx - 1] : q[q.length - 1]; setCurrent(prev); if (autoplay) autoPlayPending.current = true; setMediaSession(prev, audioRef.current!); return q; }); }
  function seek(v: number) { const a = audioRef.current; if (!a) return; a.currentTime = v; setT(v); }

  // expose next/prev for media session handlers
  useEffect(()=>{ if (typeof window === 'undefined') return; (window as any).__playNext = ()=>playNext(true); (window as any).__playPrev = ()=>playPrev(true); }, [queue, current]);

  // audio events
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => {
      setT(a.currentTime || 0);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && 'setPositionState' in (navigator as any).mediaSession) {
        // @ts-ignore
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

  // persist to localStorage (client only)
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_queue', JSON.stringify(queue)); } catch {} }, [queue]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_current', JSON.stringify(current?.id ?? null)); } catch {} }, [current]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_loop', loop); } catch {} }, [loop]);
  useEffect(() => { if (typeof window === 'undefined') return; try { localStorage.setItem('nd_sleep', JSON.stringify(sleepAt)); } catch {} }, [sleepAt]);

  function startSleep(minutes:number){ const when = Date.now() + minutes*60*1000; setSleepAt(when); }

  return (<div dir='rtl' style={{fontFamily:'system-ui,-apple-system,Segoe UI,Tahoma',background:'#f8fafc',minHeight:'100vh'}}>
    <header style={{position:'sticky',top:0,background:'#fff',borderBottom:'1px solid #e5e7eb',zIndex:10}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <img src='/logo.png' width={36} height={36} alt='logo'/><b>Nashidona • نسخة مبدئية</b>
        </div>
        <div className='stats' style={{fontSize:12,color:'#6b7280'}}>النتائج: {items.length}{count? ` / ${count}`:''}</div>
      </div>
    </header>

    <section style={{maxWidth:960,margin:'20px auto 12px auto',padding:'12px 16px'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder='ماذا تحب أن تسمع؟ اكتب اسم نشيد/منشد/ألبوم...' style={{padding:'14px 16px',border:'2px solid #d1fae5',borderRadius:12,width:'100%',maxWidth:680,fontSize:18}} autoFocus/>
      </div>
      {err && <div style={{color:'#dc2626',textAlign:'center',marginTop:8}}>{err}</div>}
    </section>

    <main style={{maxWidth:960,margin:'0 auto',padding:'0 16px calc(160px + var(--kb,0)) 16px'}}>
      <div style={{display:'grid',gap:12}}>
        {items.map(tr=>(<div key={String(tr.id)} className='trackCard' style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,border:'1px solid #e5e7eb',borderRadius:12,padding:12,background:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0,flex:1}}>
            {tr.cover_url? <img loading='lazy' src={tr.cover_url} width={54} height={54} style={{objectFit:'cover',borderRadius:10}} alt=''/>:<div style={{width:54,height:54,borderRadius:10,background:'#d1fae5'}}/>}
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,color:'#064e3b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tr.title}>{tr.title}</div>
              <div style={{fontSize:12,color:'#047857',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tr.album||'—'} {tr.year? `• ${tr.year}`:''}</div>
              {tr.artist? <div style={{fontSize:12,color:'#065f46'}}>المنشد: {tr.artist}</div>: null}
            </div>
          </div>
          <div className='actions' style={{display:'flex',gap:8}}>
            <button className='btn-queue' onClick={()=>addToQueue(tr)} style={{padding:'8px 10px',border:'1px solid #d1fae5',borderRadius:8}}>+ قائمة</button>
            <button className='btn-play' onClick={()=>{playNow(tr);}} style={{padding:'8px 10px',background:'#059669',color:'#fff',borderRadius:8}}>▶ تشغيل</button>
          </div>
        </div>))}
      </div>
      <div ref={sentinelRef} style={{height:1}}/>
    </main>

    <footer style={{position:'fixed',bottom:'var(--kb,0)',left:0,right:0,background:'#ffffffee',backdropFilter:'blur(8px)',borderTop:'1px solid #e5e7eb',zIndex:40}}>
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

    {open && (
      <div className='sheet' onClick={()=>setOpen(false)}>
        <div className='panel' onClick={(e)=>e.stopPropagation()}>
          <div className='handle'/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <b>قائمة التشغيل</b>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setOpen(false)}>إغلاق</button>
              <button onClick={clearQueue} disabled={!queue.length}>تفريغ الكل</button>
            </div>
          </div>
          <div style={{display:'grid',gap:8,maxHeight:'56vh',overflowY:'auto'}}>
            {queue.map((tr,i)=>(
              <div key={String(tr.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #e5e7eb',borderRadius:10,padding:'6px 8px',background: current&&String(current.id)===String(tr.id)? '#ecfdf5':'#fff'}}>
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

    <style jsx global>{`
      *,*::before,*::after{ box-sizing:border-box }
      html,body{ max-width:100%; overflow-x:hidden; margin:0 }
      @media (max-width: 520px) {
        .trackCard { flex-direction: column; align-items: stretch; width:100%; }
        .actions { width: 100%; display: grid !important; grid-template-columns: 1fr auto; gap:8px; }
        .btn-play { width: 100%; }
        header .stats { display: none; }
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
