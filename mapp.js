/* =========================================================================
   MAPP (the warehouse lead, 22.10.2026) — same layout as Picking / Check-in / Check-out: the units mapped (put on a shelf row)
   per day, shift and operator, maps per hour and per section. Source: WMS Pulse block E (mpH / mpS / mpZ — ProductLogs
   LogTypeId 7 joined to the unit's latest ProductCheckIns row, read-only SQL, refreshed every hour 07–22). A map = one unit put
   on a shelf row (one log row).
   People: the staff on "Orari i punës" (WODS.staffName — the same rule as every list); the shift of a person-day comes from the
   schedule (start before 12:00 → N1, otherwise N2; Saturday/Sunday → Weekend), someone not on the schedule that day by their
   first map (before 14:00 → N1).
   =======================================================================*/
let mpDate=null, mpData=null, mpSched={};
async function renderMapp(v){
  if(!mpDate) mpDate=todayStr();
  v.innerHTML=pagehead('Mapp','Vendosja e njësive në rafte (mapping) në WMS: <b>sipas ditës, ndërrimit dhe operatorit</b>, mapp për orë, rreshta dhe seksione. Burimi: WMS (log-u i mapping), rifreskohet çdo orë 07–22. Vetëm stafi në Orarin e punës.','')
    + `<div class="card mod-ctl" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label class="small" style="display:flex;gap:6px;align-items:center">Data <input type="date" id="mpDate" value="${h(mpDate)}" max="${h(todayStr())}" style="width:auto;min-height:34px"></label>
        <button class="btn sm" id="mpToday">Sot</button><button class="btn sm" id="mpYday">Dje</button>
        <span class="small faint" id="mpAt" style="margin-left:auto"></span></div></div>
      <div id="mpBody"><div class="empty">Po lexohen të dhënat…</div></div>`;
  $('#mpDate').onchange=e=>{ if(e.target.value && e.target.value<=todayStr()){ mpDate=e.target.value; mpDraw(); } };
  $('#mpToday').onclick=()=>{ mpDate=todayStr(); $('#mpDate').value=mpDate; mpDraw(); };
  $('#mpYday').onclick=()=>{ const d=new Date(todayStr()+'T12:00:00'); d.setDate(d.getDate()-1); mpDate=fmtLocalDate(d); $('#mpDate').value=mpDate; mpDraw(); };
  if(!wmsOnAgent()){ $('#mpBody').innerHTML='<div class="empty">Hape app-in nga agjenti: http://localhost:8790/app.html</div>'; return; }
  try{ const j=await fetch('/pulse/data',{cache:'no-store'}).then(r=>r.json()); mpData=j.mapping||null; }catch(e){ mpData=null; }
  if(!mpData){ $('#mpBody').innerHTML='<div class="empty">Të dhënat e mapping ende s\'janë lexuar nga WMS (blloku E i WMS Pulse) — vijnë me rifreskimin e radhës (çdo orë 07–22).</div>'; return; }
  $('#mpAt').textContent= mpData.at? 'WMS: '+new Date(mpData.at).toLocaleString() : '';
  mpDraw();
}
const mpWeekend=d=>{ const w=new Date(d+'T12:00:00').getDay(); return w===0||w===6; };
async function mpSchedFor(from, to){
  const key=from+'|'+to; if(mpSched[key]) return mpSched[key];
  try{ const j=await fetch('/schedule/days?from='+from+'&to='+to,{cache:'no-store'}).then(r=>r.json()); mpSched[key]=(j&&j.days)||{}; }catch(e){ mpSched[key]={}; }
  return mpSched[key];
}
/* the day's rows, the staff rule applied, merged by person (second accounts under the person's name) */
function mpPeople(date, sched){
  const day=sched[date]||null, norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const name=fn=>{ const n=String(fn||'').replace(/\s+/g,' ').trim()||'(pa emër)'; return (window.WODS && WODS.staffName)? WODS.staffName(n, date) : n; };
  const P={}, out={excluded:0}; const get=n=>P[n]||(P[n]={name:n, n:0, r:0, z:0, f:null, l:null, hours:{}});
  mpData.days.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n){ out.excluded+=r.n||0; return; } const p=get(n);
    ['n','r','z'].forEach(k=>p[k]+=+r[k]||0); if(r.f && (!p.f || r.f<p.f)) p.f=r.f; if(r.l && (!p.l || r.l>p.l)) p.l=r.l; });
  mpData.hours.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n) return; const p=get(n); p.hours[r.h]=(p.hours[r.h]||0)+(+r.n||0); });
  const sh=n=>{ if(mpWeekend(date)) return 'Weekend'; const k=day && Object.keys(day).find(x=>norm(x)===norm(n)), s=k&&day[k];
    if(s && !s.off){ const m=/^(\d{1,2})/.exec(s.start||''); return m && +m[1]<12? 'N1' : 'N2'; }
    const first=Math.min(...Object.keys(P[n].hours).map(Number)); return isFinite(first)? (first<14? 'N1' : 'N2') : (P[n].f && +P[n].f.slice(0,2)<14? 'N1' : 'N2'); };
  out.people=Object.values(P).map(p=>{ const hrs=Object.keys(p.hours).length, units=Object.values(p.hours).reduce((a,b)=>a+b,0);
    return Object.assign(p, {shift:sh(p.name), activeH:hrs, units, perHour: hrs? units/hrs : null}); })
    .sort((a,b)=>b.units-a.units || b.r-a.r);
  return out;
}
const mpPct=(a,b)=> b? Math.round(a/b*100)+'%' : '—';
const mpR=x=> x==null? '—' : (Math.round(x*10)/10).toLocaleString();
async function mpDraw(){
  const box=$('#mpBody'); if(!box || !mpData) return;
  const from=(()=>{ const d=new Date(mpDate+'T12:00:00'); d.setDate(d.getDate()-13); return fmtLocalDate(d); })();
  const sched=await mpSchedFor(from, mpDate);
  const D=mpPeople(mpDate, sched), ppl=D.people;
  const sum=(arr,k)=>arr.reduce((a,p)=>a+(+p[k]||0),0);
  const T={units:sum(ppl,'units'), r:sum(ppl,'r'), z:sum(ppl,'z'), h:sum(ppl,'activeH')};
  if(!ppl.length){ box.innerHTML=`<div class="empty">Asnjë mapp më ${h(fmtDateAl(mpDate))}${D.excluded? ' nga stafi në orar ('+D.excluded+' njësi nga llogari jashtë orarit)' : ''}.</div>`+mpTrend(sched); return; }
  const hrs=[...new Set(ppl.flatMap(p=>Object.keys(p.hours).map(Number)))].sort((a,b)=>a-b), byH={}; ppl.forEach(p=>Object.entries(p.hours).forEach(([k,n])=>byH[k]=(byH[k]||0)+n));
  const maxH=Math.max(1,...Object.values(byH));
  const secDay=(mpData.sections||[]).filter(r=>r.d===mpDate);
  const shifts=['N1','N2','Weekend'].map(s=>{ const g=ppl.filter(p=>p.shift===s); return g.length? {s, n:g.length, r:sum(g,'r'), units:sum(g,'units'), h:sum(g,'activeH')} : null; }).filter(Boolean);
  box.innerHTML=`
    <div class="grid g-kpi" style="margin-bottom:12px">
      ${kpiCard(T.units.toLocaleString(), 'Mapp (njësi të vendosura në raft)', T.h? mpR(T.units/T.h)+' njësi/orë për person' : '')}
      ${kpiCard(T.r.toLocaleString(), 'Rreshta rafti të përdorur', 'shuma për operator · '+ppl.length+' operatorë')}
      ${kpiCard(secDay.length? secDay.length.toLocaleString() : '—', 'Seksione të prekura', secDay.length? 'të gjitha llogaritë e magazinës' : 'pa të dhëna')}
      ${kpiCard(T.h.toLocaleString(), 'Orë aktive gjithsej', T.units? mpR(T.units/Math.max(1,T.r))+' njësi për rresht' : '')}</div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas operatorit <span class="sub">${h(fmtDateAl(mpDate))}</span></h3><div class="tablewrap"><table><thead><tr><th>Operatori</th><th>Ndërrimi</th><th>Rreshta</th><th>Seksione</th><th>Mapp</th><th>Njësi / rresht</th><th>Orë aktive</th><th>Njësi / orë</th><th>Koha</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><td><b>${h(p.name)}</b></td><td>${p.shift}</td><td>${p.r}</td><td>${p.z}</td><td>${p.units}</td><td data-sort="${p.r? p.units/p.r : 0}">${p.r? mpR(p.units/p.r) : '—'}</td><td>${p.activeH}</td>
        <td data-sort="${p.perHour||0}"><b>${mpR(p.perHour)}</b></td><td class="small">${h(p.f||'')}${p.l&&p.l!==p.f? '–'+h(p.l) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Mapp = njësi të vendosura në një rresht rafti (çdo rresht i log-ut një njësi). Rreshti / seksioni i një njësie = rreshti i fundit i saj te ProductCheckIns; numërohen për çdo operator veç e veç. Njësi / orë = mapp ÷ orët me të paktën një skanim. ${D.excluded? D.excluded+' njësi nga llogari jashtë orarit nuk numërohen.' : ''}</div></div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Mapp për orë <span class="sub">ekipi dhe secili operator</span></h3>
      <div class="mon-hide" style="display:flex;align-items:flex-end;gap:4px;height:120px;margin:8px 0 4px">${hrs.map(x=>`<div title="${String(x).padStart(2,'0')}:00 · ${byH[x]} mapp" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
        <span class="small">${byH[x]}</span><div style="width:100%;background:var(--accent);border-radius:3px 3px 0 0;height:${Math.round(byH[x]/maxH*90)}%"></div></div>`).join('')}</div>
      <div class="mon-hide" style="display:flex;gap:4px">${hrs.map(x=>`<div class="small faint" style="flex:1;text-align:center">${String(x).padStart(2,'0')}</div>`).join('')}</div>
      <div class="tablewrap" style="margin-top:10px"><table class="heat"><thead><tr><th>Operatori</th>${hrs.map(x=>`<th>${String(x).padStart(2,'0')}</th>`).join('')}<th>Gjithsej</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><th style="text-align:left">${h(p.name)}</th>${hrs.map(x=>{ const n=p.hours[x]||0; return `<td style="background:rgba(17,91,146,${(n/maxH*0.85).toFixed(2)});color:${n/maxH>0.55?'#fff':'var(--text)'}">${n||''}</td>`; }).join('')}<td><b>${p.units}</b></td></tr>`).join('')}</tbody></table></div></div>
    ${mpSections(secDay)}
    ${mpTrend(sched)}
    <div class="card sh-card" style="margin:12px 0 0"><h3 style="margin-top:0">Sipas ndërrimit</h3><div class="tablewrap"><table><thead><tr><th>Ndërrimi</th><th>Operatorë</th><th>Rreshta</th><th>Mapp</th><th>Orë aktive</th><th>Njësi / orë</th></tr></thead><tbody>
      ${shifts.map(x=>`<tr><td><b>${x.s}</b></td><td>${x.n}</td><td>${x.r}</td><td>${x.units}</td><td>${x.h}</td><td><b>${x.h? mpR(x.units/x.h) : '—'}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Ndërrimi i personit nga Orari i punës (fillim para 12:00 → N1, ndryshe N2; e shtunë/e diel → Weekend); pa orar → sipas mapp-it të parë.</div></div>`;
}
function mpSections(rows){
  rows=rows.slice().sort((a,b)=>b.n-a.n); if(!rows.length) return '';
  return `<div class="card mon-hide" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas seksionit <span class="sub">${rows.length} seksione</span></h3><div class="tablewrap"><table style="max-width:680px"><thead><tr><th>Seksioni</th><th>Mapp</th><th>Rreshta</th><th>Operatorë</th><th>Koha</th></tr></thead><tbody>
    ${rows.slice(0,40).map(r=>`<tr><td>${h(r.sec||'(pa seksion)')}</td><td>${r.n}</td><td>${r.r}</td><td>${r.ops}</td><td class="small">${h(r.f||'')}${r.l&&r.l!==r.f? '–'+h(r.l) : ''}</td></tr>`).join('')}</tbody></table></div><div class="hint">Të gjitha llogaritë e magazinës (jo vetëm stafi në orar)${rows.length>40? '; 40 më të mëdhenjtë' : ''}. Seksioni = vendi aktual i njësisë (rreshti i fundit te ProductCheckIns).</div></div>`;
}
function mpTrend(sched){
  const days=[...new Set(mpData.days.map(r=>r.d))].filter(d=>d<=mpDate).sort().slice(-14).reverse(); if(!days.length) return '';
  return `<div class="card mon-hide"><h3 style="margin-top:0">14 ditët e fundit</h3><div class="tablewrap"><table><thead><tr><th>Data</th><th>Operatorë</th><th>Rreshta</th><th>Mapp</th><th>Njësi / orë</th></tr></thead><tbody>
    ${days.map(d=>{ const P=mpPeople(d, sched).people, s=k=>P.reduce((a,p)=>a+(+p[k]||0),0), hh=s('activeH');
      return `<tr><td data-sort="${d}"><a href="#" data-mpd="${d}">${h(fmtDateAl(d))}</a></td><td>${P.length}</td><td>${s('r')}</td><td>${s('units')}</td><td>${hh? mpR(s('units')/hh) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="hint">Kliko një datë për detajet. Mapp sipas ditës dhe orës së skanimit.</div></div>`;
}
document.addEventListener('click', e=>{ const a=e.target.closest && e.target.closest('[data-mpd]'); if(!a) return; e.preventDefault(); mpDate=a.dataset.mpd; const i=$('#mpDate'); if(i) i.value=mpDate; mpDraw(); window.scrollTo(0,0); });
