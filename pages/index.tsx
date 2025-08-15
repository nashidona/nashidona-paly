import React, { useEffect, useMemo, useRef, useState } from 'react';
type Track = { id: number|string; title: string; album?: string; cover_url?: string; url: string; year?: string };
const fmt=(s:number)=>{if(!isFinite(s)||s<0)return'0:00';const m=Math.floor(s/60);const ss=Math.floor(s%60);return`${m}:${ss.toString().padStart(2,'0')}`};
export default function Home(){
  const[q,setQ]=useState(''); const[items,setItems]=useState<Track[]>([]);
  const[queue,setQueue]=useState<Track[]>(()=>{try{const raw=localStorage.getItem('nd_queue');return raw?JSON.parse(raw):[];}catch{return[]}});
  const[current,setCurrent]=useState<Track|null>(()=>{try{const raw=localStorage.getItem('nd_current');const id=raw?JSON.parse(raw):null;const arrRaw=localStorage.getItem('nd_queue');const arr:Track[]=arrRaw?JSON.parse(arrRaw):[];return id? (arr.find(x=>String(x.id)===String(id))||null):null;}catch{return null}});
  const[t,setT]=useState(0); const[dur,setDur]=useState(0); const[open,setOpen]=useState(false); const aRef=useRef<HTMLAudioElement|null>(null);
  async function search(){ const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=200`); const j=await r.json(); setItems(j.items||[]); }
  useEffect(()=>{ search(); },[]);
  useEffect(()=>{ try{localStorage.setItem('nd_queue', JSON.stringify(queue));}catch{} },[queue]);
  useEffect(()=>{ try{localStorage.setItem('nd_current', JSON.stringify(current?.id??null));}catch{} },[current]);
  useEffect(()=>{ const a=aRef.current;if(!a)return; const onTime=()=>setT(a.currentTime||0); const onMeta=()=>setDur(a.duration||0); const onEnd=()=>playNext(); a.addEventListener('timeupdate',onTime); a.addEventListener('loadedmetadata',onMeta); a.addEventListener('ended',onEnd); return()=>{a.removeEventListener('timeupdate',onTime);a.removeEventListener('loadedmetadata',onMeta);a.removeEventListener('ended',onEnd);}; },[current,queue]);
  function playNow(tr:Track){ setCurrent(tr); if(!queue.find(x=>String(x.id)===String(tr.id))) setQueue(q=>[tr,...q]); setTimeout(()=>{aRef.current?.play().catch(()=>{});},0); }
  function addToQueue(tr:Track){ setQueue(q=> (q.find(x=>String(x.id)===String(tr.id))? q: [...q,tr])); }
  function clearQueue(){ setQueue([]); setCurrent(null); }
  function removeFromQueue(id:Track['id']){ setQueue(q=>q.filter(x=>String(x.id)!==String(id))); if(current&&String(current.id)===String(id)) setTimeout(playNext,0); }
  function move(id:Track['id'],dir:-1|1){ setQueue(q=>{ const i=q.findIndex(x=>String(x.id)===String(id)); if(i<0)return q; const j=i+dir; if(j<0||j>=q.length)return q; const c=[...q]; const tmp=c[i]; c[i]=c[j]; c[j]=tmp; return c; }); }
  function playNext(){ setQueue(q=>{ if(!q.length){ setCurrent(null); return q;} const idx=current? q.findIndex(x=>String(x.id)===String(current.id)):-1; const next=(idx>=0&&idx<q.length-1)? q[idx+1]: q[0]; setCurrent(next); return q; }); }
  function playPrev(){ setQueue(q=>{ if(!q.length){ setCurrent(null); return q;} const idx=current? q.findIndex(x=>String(x.id)===String(current.id)):-1; const prev=(idx>0)? q[idx-1]: q[q.length-1]; setCurrent(prev); return q; }); }
  function seek(v:number){ const a=aRef.current; if(!a)return; a.currentTime=v; setT(v); }
  return (<div dir='rtl' style={{fontFamily:'system-ui,-apple-system,Segoe UI,Tahoma',background:'#f8fafc'}}>
    <header style={{position:'sticky',top:0,background:'#fff',borderBottom:'1px solid #e5e7eb',zIndex:10}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <img src='/logo.png' width={36} height={36} alt='logo'/><b>Nashidona • نسخة مبدئية</b>
        </div>
        <div style={{display:'flex',gap:8}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder='ابحث عن نشيد، منشد، أو ألبوم' style={{padding:'8px 12px',border:'1px solid #d1fae5',borderRadius:8,width:320}}/>
          <button onClick={search} style={{padding:'8px 12px',background:'#059669',color:'#fff',borderRadius:8}}>بحث</button>
        </div>
      </div>
    </header>
    <main style={{maxWidth:960,margin:'0 auto',padding:'12px 16px 120px 16px'}}>
      <h3>النتائج ({items.length})</h3>
      <div style={{display:'grid',gap:12}}>
        {items.map(tr=>(<div key={String(tr.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #e5e7eb',borderRadius:12,padding:12,background:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}>
            {tr.cover_url? <img src={tr.cover_url} width={44} height={44} style={{objectFit:'cover',borderRadius:10}} alt=''/>:<div style={{width:44,height:44,borderRadius:10,background:'#d1fae5'}}/>}
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,color:'#064e3b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tr.title}>{tr.title}</div>
              <div style={{fontSize:12,color:'#047857',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tr.album||'—'} {tr.year? `• ${tr.year}`:''}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>addToQueue(tr)} style={{padding:'6px 8px',border:'1px solid #d1fae5',borderRadius:8}}>+ قائمة التشغيل</button>
            <button onClick={()=>playNow(tr)} style={{padding:'6px 8px',background:'#059669',color:'#fff',borderRadius:8}}>▶ تشغيل</button>
          </div>
        </div>))}
      </div>
    </main>
    <footer style={{position:'fixed',bottom:0,left:0,right:0,background:'#ffffffcc',backdropFilter:'blur(6px)',borderTop:'1px solid #e5e7eb'}}>
      <div style={{maxWidth:960,margin:'0 auto',padding:'8px 16px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={playPrev} title='السابق'>⏮</button>
        <button onClick={()=>{const a=aRef.current;if(!a)return;if(a.paused)a.play();else a.pause();}} title='تشغيل/إيقاف'>⏯</button>
        <button onClick={playNext} title='التالي'>⏭</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
          <span style={{width:44,textAlign:'left',fontVariantNumeric:'tabular-nums'}}>{fmt(t)}</span>
          <input type='range' min={0} max={Math.max(1,dur)} step={1} value={Math.min(t,dur||0)} onChange={(e)=>seek(parseFloat(e.target.value))} style={{flex:1}}/>
          <span style={{width:44,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(dur)}</span>
        </div>
        <button onClick={()=>setOpen(v=>!v)} title='عرض/إخفاء قائمة التشغيل' style={{padding:'6px 10px',border:'1px solid #d1fae5',borderRadius:8}}>قائمة التشغيل ({queue.length})</button>
        <audio ref={aRef} src={current? `/api/stream/${current.id}`: undefined} preload='metadata'/>
      </div>
      <div style={{maxWidth:960,margin:'0 auto',padding:'0 16px 12px 16px',display:open?'block':'none'}}>
        <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <b>قائمة التشغيل</b>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setOpen(false)}>إغلاق</button>
              <button onClick={clearQueue} disabled={!queue.length}>تفريغ الكل</button>
            </div>
          </div>
          <div style={{display:'grid',gap:8,marginTop:8,maxHeight:240,overflowY:'auto'}}>
            {queue.map((tr,i)=>(<div key={String(tr.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #e5e7eb',borderRadius:10,padding:'6px 8px',background: current&&String(current.id)===String(tr.id)? '#ecfdf5':'#fff'}}>
              <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={tr.title}>{tr.title}</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>move(tr.id,-1)} disabled={i===0} title='أعلى'>⬆</button>
                <button onClick={()=>move(tr.id,+1)} disabled={i===queue.length-1} title='أسفل'>⬇</button>
                <button onClick={()=>removeFromQueue(tr.id)} title='حذف'>✕</button>
                <button onClick={()=>setCurrent(tr)} title='تشغيل'>▶</button>
              </div>
            </div>))}
            {!queue.length && <div style={{color:'#6b7280'}}>لا يوجد عناصر بعد. أضف من النتائج أعلاه.</div>}
          </div>
        </div>
      </div>
    </footer>
  </div>);
}