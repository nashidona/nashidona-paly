import React, { useEffect, useRef, useState } from 'react';

type Track = { id: number|string; title: string; album?: string; artist?: string; cover_url?: string; url: string; year?: string };

function fmt(sec: number) { if (!isFinite(sec) || sec < 0) return '0:00'; const m = Math.floor(sec/60); const s = Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }
function useDebounced<T>(value: T, delay = 300) { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]); return v; }

export default function Home() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [items, setItems] = useState<Track[]>([]);
  const [count, setCount] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [queue, setQueue] = useState<Track[]>(() => { try { const raw = localStorage.getItem('nd_queue'); return raw? JSON.parse(raw): []; } catch { return []; } });
  const [current, setCurrent] = useState<Track | null>(() => { try { const raw = localStorage.getItem('nd_current'); const id = raw? JSON.parse(raw): null; const qraw = localStorage.getItem('nd_queue'); const arr: Track[] = qraw? JSON.parse(qraw): []; return id? (arr.find(x => String(x.id) === String(id)) || null) : null; } catch { return null; } });
  const [t, setT] = useState(0); const [dur, setDur] = useState(0); const [open, setOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayPending = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
  useEffect(() => { setOffset(0); fetchPage(0, false); }, [dq]);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setT(a.currentTime || 0);
    const onMeta = () => { setDur(a.duration || 0); if (autoPlayPending.current) { a.play().catch(()=>{}); autoPlayPending.current = false; } };
    const onEnd = () => { playNext(true); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd); };
  }, [current, queue]);

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

  function playNow(tr: Track) { setCurrent(tr); if (!queue.find(x => String(x.id) === String(tr.id))) setQueue(q => [tr, ...q]); autoPlayPending.current = true; }
  function addToQueue(tr: Track) { setQueue(q => (q.find(x => String(x.id) === String(tr.id)) ? q : [...q, tr])); }
  function clearQueue() { setQueue([]); setCurrent(null); }
  function removeFromQueue(id: Track['id']) { setQueue(q => q.filter(x => String(x.id) !== String(id))); if (current && String(current.id) === String(id)) setTimeout(() => playNext(true), 0); }
  function move(id: Track['id'], dir: -1|1) { setQueue(q => { const i = q.findIndex(x => String(x.id) === String(id)); if (i < 0) return q; const j = i + dir; if (j < 0 || j >= q.length) return q; const c=[...q]; const tmp=c[i]; c[i]=c[j]; c[j]=tmp; return c; }); }
  function playNext(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const next = (idx >= 0 && idx < q.length - 1) ? q[idx + 1] : q[0]; setCurrent(next); if (autoplay) autoPlayPending.current = true; return q; }); }
  function playPrev(autoplay = false) { setQueue(q => { if (!q.length) { setCurrent(null); return q; } const idx = current ? q.findIndex(x => String(x.id) === String(current.id)) : -1; const prev = (idx > 0) ? q[idx - 1] : q[q.length - 1]; setCurrent(prev); if (autoplay) autoPlayPending.current = true; return q; }); }
  function seek(v: number) { const a = audioRef.current; if (!a) return; a.currentTime = v; setT(v); }

  useEffect(() => { try { localStorage.setItem('nd_queue', JSON.stringify(queue)); } catch {} }, [queue]);
  useEffect(() => { try { localStorage.setItem('nd_current', JSON.stringify(current?.id ?? null)); } catch {} }, [current]);

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

    <main style={{maxWidth:960,margin:'0 auto',padding:'0 16px 140px 16px'}}>
      <div style={{display:'grid',gap:12}}>
        {items.map(tr=>(<div key={String(tr.id)} className='trackCard' style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,border:'1px solid #e5e7eb',borderRadius:12,padding:12,background:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0,flex:1}}>
            {tr.cover_url? <img src={tr.cover_url} width={54} height={54} style={{objectFit:'cover',borderRadius:10}} alt=''/>:<div style={{width:54,height:54,borderRadius:10,background:'#d1fae5'}}/>}
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,color:'#064e3b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tr.title}>{tr.title}</div>
              <div style={{fontSize:12,color:'#047857',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tr.album||'—'} {tr.year? `• ${tr.year}`:''}</div>
              {tr.artist? <div style={{fontSize:12,color:'#065f46'}}>المنشد: {tr.artist}</div>: null}
            </div>
          </div>
          <div className='actions' style={{display:'flex',gap:8}}>
            <button onClick={()=>addToQueue(tr)} style={{padding:'8px 10px',border:'1px solid #d1fae5',borderRadius:8}}>+ قائمة</button>
            <button onClick={()=>{playNow(tr);}} style={{padding:'8px 10px',background:'#059669',color:'#fff',borderRadius:8}}>▶ تشغيل</button>
          </div>
        </div>))}
      </div>
      <div ref={sentinelRef} style={{height:1}}/>
    </main>

    <footer style={{position:'fixed',bottom:0,left:0,right:0,background:'#ffffffee',backdropFilter:'blur(8px)',borderTop:'1px solid #e5e7eb',zIndex:20}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'10px 12px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>playPrev(true)} title='السابق'>⏮</button>
        <button onClick={()=>{const a=audioRef.current;if(!a)return;if(a.paused)a.play();else a.pause();}} title='تشغيل/إيقاف'>⏯</button>
        <button onClick={()=>playNext(true)} title='التالي'>⏭</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
          <span style={{width:42,textAlign:'left',fontVariantNumeric:'tabular-nums'}}>{fmt(t)}</span>
          <input type='range' min={0} max={Math.max(1,dur)} step={1} value={Math.min(t,dur||0)} onChange={(e)=>{const v=parseFloat(e.target.value); const a=audioRef.current; if(a){a.currentTime=v;} setT(v);}} style={{flex:1}}/>
          <span style={{width:42,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(dur)}</span>
        </div>
        <button onClick={()=>setOpen(v=>!v)} title='عرض/إخفاء قائمة التشغيل' style={{padding:'6px 10px',border:'1px solid #d1fae5',borderRadius:8}}>قائمة ({queue.length})</button>
        <audio ref={audioRef} src={current? `/api/stream/${current.id}`: undefined} preload='metadata'/>
      </div>
    </footer>

    <style jsx global>{`
      @media (max-width: 520px) {
        .trackCard { flex-direction: column; align-items: stretch; }
        .actions { width: 100%; justify-content: space-between; }
        header .stats { display: none; }
      }
    `}</style>
  </div>);
}