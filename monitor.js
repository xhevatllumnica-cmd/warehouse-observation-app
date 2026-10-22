/* =========================================================================
   MONITOR (the warehouse lead, 22.10.2026) — the modules Picking, Check-in, Check-out, Mapp and POD (skanime) shown one after
   another on a screen, 20 seconds each (the time and the modules are the user's choice, kept in this browser). Every module is
   drawn by its own render function for TODAY, then the page head, the date bar and the "Sipas ndërrimit" card are hidden
   (CSS .mon-stage) — the rest of the module stays as it is. A module taller than the screen is scaled down to fit (CSS zoom).
   Each pass redraws the module, so the figures are as fresh as the WMS Pulse refresh (hourly) / the Delivery Platform read.
   "Ekran i plotë" puts only the monitor on the screen; Esc leaves it. Leaving the tab stops the loop.
   =======================================================================*/
const MON_MODULES=[
  {id:'picking', title:'Picking',       render:()=>renderPicking($('#monStage')),   reset:()=>{ pkDate=null; }, body:'#pkBody'},
  {id:'checkin', title:'Check-in',      render:()=>renderCheckin($('#monStage')),   reset:()=>{ ckDate=null; }, body:'#ckBody'},
  {id:'checkout',title:'Check-out',     render:()=>renderCheckout($('#monStage')),  reset:()=>{ coDate=null; }, body:'#coBody'},
  {id:'mapp',    title:'Mapp',          render:()=>renderMapp($('#monStage')),      reset:()=>{ mpDate=null; }, body:'#mpBody'},
  {id:'podscan', title:'POD (skanime)', render:()=>renderPodScan($('#monStage')),   reset:()=>{ pdDate=null; }, body:'#pdBody'}];
const MON_DAYS=['E diel','E hënë','E martë','E mërkurë','E enjte','E premte','E shtunë'];
let monToken=0, monPaused=false, monSkip=false, monRedo=false;
const monGet=()=>{ try{ return JSON.parse(localStorage.getItem('monitorSettings')||'null'); }catch(e){ return null; } };
const monSet=s=>{ try{ localStorage.setItem('monitorSettings', JSON.stringify(s)); }catch(e){} };
function monSettings(){ const s=monGet()||{}; return {sec: Math.max(5, +s.sec||20), on: Array.isArray(s.on)? s.on : MON_MODULES.map(m=>m.id)}; }
function renderMonitor(v){
  const my=++monToken, S=monSettings(); monPaused=false; monSkip=false;
  v.innerHTML=pagehead('Monitor','Modulet Picking, Check-in, Check-out, Mapp dhe POD (skanime) <b>një nga një në ekran</b>, secili për sekondat e zgjedhura (20 si parazgjedhje). Shfaqet çdo gjë e modulit përveç seksionit "Sipas ndërrimit". Për monitorin e magazinës shtyp "Ekran i plotë".','')
    + `<div id="monWrap" class="mon-wrap">
        <div class="card mon-tools" style="margin-bottom:12px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          ${MON_MODULES.map(m=>`<label class="small" style="display:flex;gap:5px;align-items:center"><input type="checkbox" data-mon="${m.id}" ${S.on.includes(m.id)?'checked':''}> ${h(m.title)}</label>`).join('')}
          <label class="small" style="display:flex;gap:5px;align-items:center">Sekonda <input type="number" id="monSec" min="5" max="600" value="${S.sec}" style="width:70px;min-height:34px"></label>
          <button class="btn sm" id="monPause">⏸ Pauzë</button><button class="btn sm" id="monNext">Tjetri ▸</button></div></div>
        <div class="mon-top"><div class="mon-stripe"></div>
          <div><div class="mon-title"><span id="monTitle">…</span> <span class="small faint" id="monPos" style="font-weight:400"></span></div><div class="mon-sub" id="monSub">—</div></div>
          <div class="mon-clock" id="monClock">--:--</div>
          <div class="mon-act"><input type="date" id="monDate" class="btn" disabled title="Data e sotme" style="padding:5px 8px"><button class="btn" id="monRefresh" title="Rifresko modulin tani">⟳</button><button class="btn" id="monFull">⛶ Ekran i plotë</button></div></div>
        <div class="mon-bar"><div id="monFill"></div></div>
        <div class="mon-area" id="monArea"><div class="mon-stage" id="monStage"></div></div></div>`;
  const save=()=>{ monSet({sec:Math.max(5,+$('#monSec').value||20), on:[...document.querySelectorAll('[data-mon]')].filter(c=>c.checked).map(c=>c.dataset.mon)}); };
  document.querySelectorAll('[data-mon]').forEach(c=>c.onchange=save); $('#monSec').onchange=save;
  $('#monPause').onclick=()=>{ monPaused=!monPaused; $('#monPause').textContent= monPaused? '▶ Vazhdo' : '⏸ Pauzë'; };
  $('#monNext').onclick=()=>{ monSkip=true; };
  $('#monFull').onclick=()=>{ const w=$('#monWrap'); if(document.fullscreenElement) document.exitFullscreen(); else if(w.requestFullscreen) w.requestFullscreen(); };
  $('#monRefresh').onclick=()=>{ monRedo=true; };
  const clock=()=>{ const c=$('#monClock'); if(!c) return; const n=new Date(), iso=fmtLocalDate(n);
    c.textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
    $('#monSub').textContent=MON_DAYS[n.getDay()]+', '+fmtDateAl(iso); $('#monDate').value=iso; }; clock();
  const ck=setInterval(()=>{ if(my!==monToken||!$('#monClock')) return clearInterval(ck); clock(); }, 1000);
  monLoop(my);
}
const monAlive=my=> my===monToken && !!document.getElementById('monStage');
const monSleep=ms=>new Promise(r=>setTimeout(r,ms));
async function monLoop(my){
  let i=0;
  while(monAlive(my)){
    const S=monSettings(), mods=MON_MODULES.filter(m=>S.on.includes(m.id));
    if(!mods.length){ $('#monTitle').textContent='Zgjidh të paktën një modul'; $('#monStage').innerHTML=''; await monSleep(1000); continue; }
    const m=mods[i%mods.length]; i++;
    $('#monTitle').textContent=m.title; $('#monPos').textContent=((i-1)%mods.length+1)+' / '+mods.length; $('#monFill').style.width='0%';
    try{ await monShow(m, my); }catch(e){ if(monAlive(my)) $('#monStage').innerHTML='<div class="empty">'+h(m.title)+': '+h(String(e&&e.message||e))+'</div>'; }
    if(!monAlive(my)) return;
    await monWait(S.sec, my);
    if(monRedo){ monRedo=false; i--; }
  }
}
/* draw the module for today and wait until its body is no longer the "reading…" placeholder (a slow read: 30 s at most) */
async function monShow(m, my){
  const st=$('#monStage'); m.reset(); st.style.zoom=1; st.innerHTML='';
  await m.render();
  for(let t=0; t<120 && monAlive(my); t++){ const b=document.querySelector(m.body); if(b && !/^Po lexohen/.test(b.innerText.trim())) break; await monSleep(250); }
  monSplit(); await monSleep(150); monFit();
}
/* the cards marked .mon-split (Picking "Sipas stacionit") are shown in two columns side by side: the rows are halved over two tables */
function monSplit(){
  document.querySelectorAll('#monStage .mon-split').forEach(c=>{
    const t=c.querySelector('table'), body=t&&t.querySelector('tbody'); if(!body) return;
    const rows=[...body.children]; if(rows.length<2) return;
    const half=Math.ceil(rows.length/2), t2=t.cloneNode(true), b2=t2.querySelector('tbody');
    b2.innerHTML=''; rows.slice(half).forEach(r=>b2.appendChild(r));
    [t,t2].forEach(x=>{ x.style.maxWidth='none'; x.style.width='100%'; });
    const wrap=document.createElement('div'); wrap.className='mon-cols'; t.parentNode.insertBefore(wrap,t); wrap.appendChild(t); wrap.appendChild(t2);
  });
}
/* a module taller than the screen is scaled down to fit (0.6 at least); a short one is enlarged a little (1.25 at most).
   If it still does not fit at 0.6, the area scrolls by itself from top to bottom while the module is shown (see monWait). */
function monFit(){
  const st=$('#monStage'), area=$('#monArea'); if(!st||!area) return;
  st.style.zoom=1; area.style.height='auto'; area.scrollTop=0;
  const avail=Math.max(200, window.innerHeight-area.getBoundingClientRect().top-12), need=st.scrollHeight;
  if(need>0) st.style.zoom=Math.max(0.6, Math.min(1.25, avail/need)).toFixed(3);
  area.style.height=avail+'px'; area.style.overflow='hidden';
}
window.addEventListener('resize', ()=>{ if(document.getElementById('monStage')) monFit(); });
document.addEventListener('fullscreenchange', ()=>{ if(document.getElementById('monStage')) setTimeout(monFit, 200); });
async function monWait(sec, my){
  const t0=Date.now(); let paused=0, last=t0;
  while(monAlive(my)){
    const now=Date.now(); if(monPaused) paused+=now-last; last=now;
    const el=(now-t0-paused)/1000; $('#monFill').style.width=Math.min(100,el/sec*100)+'%';
    const ar=$('#monArea'); if(ar){ const mx=ar.scrollHeight-ar.clientHeight; if(mx>4) ar.scrollTop=mx*Math.min(1, el/(sec*0.85)); }
    if(monSkip || monRedo){ monSkip=false; return; }
    if(el>=sec) return; await monSleep(250);
  }
}
