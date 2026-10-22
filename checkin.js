/* =========================================================================
   CHECK-IN (the warehouse lead, 22.10.2026) — same layout as Picking: the units checked in per day, shift and operator,
   check-ins per hour, supplies and products. Source: WMS Pulse block E (ciH / ciS / ciSu — ProductLogs LogTypeId 2 joined to
   ProductCheckIns, read-only SQL, refreshed every hour 07–22) + ciBulk (check-ins with no log, a bulk check-in writes
   ProductCheckIns only). A check-in = one unit checked in (one log row).
   People: the staff on "Orari i punës" (WODS.staffName — the same rule as every list); the shift of a person-day comes from the
   schedule (start before 12:00 → N1, otherwise N2; Saturday/Sunday → Weekend), someone not on the schedule that day by their
   first check-in (before 14:00 → N1).
   =======================================================================*/
let ckDate=null, ckData=null, ckBulk=[], ckSched={};
async function renderCheckin(v){
  if(!ckDate) ckDate=todayStr();
  v.innerHTML=pagehead('Check-in','Pranimi i njësive në WMS: <b>sipas ditës, ndërrimit dhe operatorit</b>, check-in për orë, furnizime dhe produkte. Burimi: WMS (log-u i check-in), rifreskohet çdo orë 07–22. Vetëm stafi në Orarin e punës.','')
    + `<div class="card mod-ctl" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label class="small" style="display:flex;gap:6px;align-items:center">Data <input type="date" id="ckDate" value="${h(ckDate)}" max="${h(todayStr())}" style="width:auto;min-height:34px"></label>
        <button class="btn sm" id="ckToday">Sot</button><button class="btn sm" id="ckYday">Dje</button>
        <span class="small faint" id="ckAt" style="margin-left:auto"></span></div></div>
      <div id="ckBody"><div class="empty">Po lexohen të dhënat…</div></div>`;
  $('#ckDate').onchange=e=>{ if(e.target.value && e.target.value<=todayStr()){ ckDate=e.target.value; ckDraw(); } };
  $('#ckToday').onclick=()=>{ ckDate=todayStr(); $('#ckDate').value=ckDate; ckDraw(); };
  $('#ckYday').onclick=()=>{ const d=new Date(todayStr()+'T12:00:00'); d.setDate(d.getDate()-1); ckDate=fmtLocalDate(d); $('#ckDate').value=ckDate; ckDraw(); };
  if(!wmsOnAgent()){ $('#ckBody').innerHTML='<div class="empty">Hape app-in nga agjenti: http://localhost:8790/app.html</div>'; return; }
  try{ const j=await fetch('/pulse/data',{cache:'no-store'}).then(r=>r.json()); ckData=j.checkin||null; ckBulk=(j.checkinBulk&&j.checkinBulk.rows)||[]; }catch(e){ ckData=null; ckBulk=[]; }
  if(!ckData){ $('#ckBody').innerHTML='<div class="empty">Të dhënat e check-in ende s\'janë lexuar nga WMS (blloku E i WMS Pulse) — vijnë me rifreskimin e radhës (çdo orë 07–22).</div>'; return; }
  $('#ckAt').textContent= ckData.at? 'WMS: '+new Date(ckData.at).toLocaleString() : '';
  ckDraw();
}
const ckWeekend=d=>{ const w=new Date(d+'T12:00:00').getDay(); return w===0||w===6; };
async function ckSchedFor(from, to){
  const key=from+'|'+to; if(ckSched[key]) return ckSched[key];
  try{ const j=await fetch('/schedule/days?from='+from+'&to='+to,{cache:'no-store'}).then(r=>r.json()); ckSched[key]=(j&&j.days)||{}; }catch(e){ ckSched[key]={}; }
  return ckSched[key];
}
/* the day's rows, the staff rule applied, merged by person (second accounts under the person's name); bulk check-ins added */
function ckPeople(date, sched){
  const day=sched[date]||null, norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const name=fn=>{ const n=String(fn||'').replace(/\s+/g,' ').trim()||'(pa emër)'; return (window.WODS && WODS.staffName)? WODS.staffName(n, date) : n; };
  const P={}, out={excluded:0}; const get=n=>P[n]||(P[n]={name:n, n:0, s:0, k:0, o:0, bulk:0, f:null, l:null, hours:{}});
  const span=(p,f,l)=>{ if(f && (!p.f || f<p.f)) p.f=f; if(l && (!p.l || l>p.l)) p.l=l; };
  ckData.days.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n){ out.excluded+=r.n||0; return; } const p=get(n);
    ['n','s','k','o'].forEach(k=>p[k]+=+r[k]||0); span(p,r.f,r.l); });
  ckData.hours.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n) return; const p=get(n); p.hours[r.h]=(p.hours[r.h]||0)+(+r.n||0); });
  ckBulk.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n){ out.excluded+=r.n||0; return; } const p=get(n);
    p.n+=+r.n||0; p.bulk+=+r.n||0; p.hours[r.h]=(p.hours[r.h]||0)+(+r.n||0); span(p,r.f,r.l); });
  const sh=n=>{ if(ckWeekend(date)) return 'Weekend'; const k=day && Object.keys(day).find(x=>norm(x)===norm(n)), s=k&&day[k];
    if(s && !s.off){ const m=/^(\d{1,2})/.exec(s.start||''); return m && +m[1]<12? 'N1' : 'N2'; }
    const first=Math.min(...Object.keys(P[n].hours).map(Number)); return isFinite(first)? (first<14? 'N1' : 'N2') : (P[n].f && +P[n].f.slice(0,2)<14? 'N1' : 'N2'); };
  out.people=Object.values(P).map(p=>{ const hrs=Object.keys(p.hours).length, units=Object.values(p.hours).reduce((a,b)=>a+b,0);
    return Object.assign(p, {shift:sh(p.name), activeH:hrs, units, perHour: hrs? units/hrs : null}); })
    .sort((a,b)=>b.units-a.units || b.s-a.s);
  return out;
}
const ckPct=(a,b)=> b? Math.round(a/b*100)+'%' : '—';
const ckR=x=> x==null? '—' : (Math.round(x*10)/10).toLocaleString();
async function ckDraw(){
  const box=$('#ckBody'); if(!box || !ckData) return;
  const from=(()=>{ const d=new Date(ckDate+'T12:00:00'); d.setDate(d.getDate()-13); return fmtLocalDate(d); })();
  const sched=await ckSchedFor(from, ckDate);
  const D=ckPeople(ckDate, sched), ppl=D.people;
  const sum=(arr,k)=>arr.reduce((a,p)=>a+(+p[k]||0),0);
  const T={units:sum(ppl,'units'), s:sum(ppl,'s'), k:sum(ppl,'k'), o:sum(ppl,'o'), bulk:sum(ppl,'bulk'), h:sum(ppl,'activeH')};
  if(!ppl.length){ box.innerHTML=`<div class="empty">Asnjë check-in më ${h(fmtDateAl(ckDate))}${D.excluded? ' nga stafi në orar ('+D.excluded+' njësi nga llogari jashtë orarit)' : ''}.</div>`+ckTrend(sched); return; }
  const hrs=[...new Set(ppl.flatMap(p=>Object.keys(p.hours).map(Number)))].sort((a,b)=>a-b), byH={}; ppl.forEach(p=>Object.entries(p.hours).forEach(([k,n])=>byH[k]=(byH[k]||0)+n));
  const maxH=Math.max(1,...Object.values(byH));
  const shifts=['N1','N2','Weekend'].map(s=>{ const g=ppl.filter(p=>p.shift===s); return g.length? {s, n:g.length, ss:sum(g,'s'), k:sum(g,'k'), o:sum(g,'o'), units:sum(g,'units'), h:sum(g,'activeH')} : null; }).filter(Boolean);
  box.innerHTML=`
    <div class="grid g-kpi" style="margin-bottom:12px">
      ${kpiCard(T.units.toLocaleString(), 'Check-in (njësi të pranuara)', T.h? ckR(T.units/T.h)+' njësi/orë për person' : '')}
      ${kpiCard(T.s.toLocaleString(), 'Furnizime (supply) të prekura', ppl.length+' operatorë')}
      ${kpiCard(T.k.toLocaleString(), 'Produkte (kode) të ndryshme', 'shuma për operator')}
      ${kpiCard(ckPct(T.o,T.units), 'Njësi me porosi', T.o.toLocaleString()+' njësi të lidhura me një porosi'+(T.bulk? ' · '+T.bulk+' check-in masiv (pa log)' : ''))}</div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas operatorit <span class="sub">${h(fmtDateAl(ckDate))}</span></h3><div class="tablewrap"><table><thead><tr><th>Operatori</th><th>Ndërrimi</th><th>Furnizime</th><th>Produkte</th><th>Check-in</th><th>Me porosi</th><th>Orë aktive</th><th>Njësi / orë</th><th>Koha</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><td><b>${h(p.name)}</b></td><td>${p.shift}</td><td>${p.s}</td><td>${p.k}</td><td>${p.units}${p.bulk? ' <span class="faint small">(+'+p.bulk+' masiv)</span>' : ''}</td>
        <td data-sort="${p.units? p.o/p.units : 0}">${p.o} <span class="faint">(${ckPct(p.o,p.units)})</span></td><td>${p.activeH}</td><td data-sort="${p.perHour||0}"><b>${ckR(p.perHour)}</b></td>
        <td class="small">${h(p.f||'')}${p.l&&p.l!==p.f? '–'+h(p.l) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Check-in = njësi të pranuara (çdo rresht i log-ut një njësi); check-in masiv (pa log) shtohet te personi. Njësi / orë = check-in ÷ orët me të paktën një skanim. Furnizime / produkte numërohen për çdo operator veç e veç. ${D.excluded? D.excluded+' njësi nga llogari jashtë orarit nuk numërohen.' : ''}</div></div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Check-in për orë <span class="sub">ekipi dhe secili operator</span></h3>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin:8px 0 4px">${hrs.map(x=>`<div title="${String(x).padStart(2,'0')}:00 · ${byH[x]} check-in" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
        <span class="small">${byH[x]}</span><div style="width:100%;background:var(--accent);border-radius:3px 3px 0 0;height:${Math.round(byH[x]/maxH*90)}%"></div></div>`).join('')}</div>
      <div style="display:flex;gap:4px">${hrs.map(x=>`<div class="small faint" style="flex:1;text-align:center">${String(x).padStart(2,'0')}</div>`).join('')}</div>
      <div class="tablewrap" style="margin-top:10px"><table class="heat"><thead><tr><th>Operatori</th>${hrs.map(x=>`<th>${String(x).padStart(2,'0')}</th>`).join('')}<th>Gjithsej</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><th style="text-align:left">${h(p.name)}</th>${hrs.map(x=>{ const n=p.hours[x]||0; return `<td style="background:rgba(17,91,146,${(n/maxH*0.85).toFixed(2)});color:${n/maxH>0.55?'#fff':'var(--text)'}">${n||''}</td>`; }).join('')}<td><b>${p.units}</b></td></tr>`).join('')}</tbody></table></div></div>
    ${ckSupplies()}
    ${ckTrend(sched)}
    <div class="card sh-card" style="margin:12px 0 0"><h3 style="margin-top:0">Sipas ndërrimit</h3><div class="tablewrap"><table><thead><tr><th>Ndërrimi</th><th>Operatorë</th><th>Furnizime</th><th>Check-in</th><th>Me porosi</th><th>Orë aktive</th><th>Njësi / orë</th></tr></thead><tbody>
      ${shifts.map(x=>`<tr><td><b>${x.s}</b></td><td>${x.n}</td><td>${x.ss}</td><td>${x.units}</td><td>${x.o} <span class="faint">(${ckPct(x.o,x.units)})</span></td><td>${x.h}</td><td><b>${x.h? ckR(x.units/x.h) : '—'}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Ndërrimi i personit nga Orari i punës (fillim para 12:00 → N1, ndryshe N2; e shtunë/e diel → Weekend); pa orar → sipas check-in-it të parë.</div></div>`;
}
function ckSupplies(){
  const rows=(ckData.supplies||[]).filter(r=>r.d===ckDate).sort((a,b)=>b.n-a.n); if(!rows.length) return '';
  return `<div class="card mon-hide" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas furnizimit <span class="sub">${rows.length} furnizime</span></h3><div class="tablewrap"><table style="max-width:680px"><thead><tr><th>Furnizimi (supply)</th><th>Check-in</th><th>Produkte</th><th>Operatorë</th><th>Koha</th></tr></thead><tbody>
    ${rows.slice(0,40).map(r=>`<tr><td>${h(r.sid||'(pa furnizim)')}</td><td>${r.n}</td><td>${r.k}</td><td>${r.ops}</td><td class="small">${h(r.f||'')}${r.l&&r.l!==r.f? '–'+h(r.l) : ''}</td></tr>`).join('')}</tbody></table></div><div class="hint">Të gjitha llogaritë e magazinës (jo vetëm stafi në orar)${rows.length>40? '; 40 më të mëdhenjtë' : ''}. Furnizimi i një njësie = rreshti i fundit i saj te ProductCheckIns.</div></div>`;
}
function ckTrend(sched){
  const days=[...new Set(ckData.days.map(r=>r.d))].filter(d=>d<=ckDate).sort().slice(-14).reverse(); if(!days.length) return '';
  return `<div class="card mon-hide"><h3 style="margin-top:0">14 ditët e fundit</h3><div class="tablewrap"><table><thead><tr><th>Data</th><th>Operatorë</th><th>Furnizime</th><th>Check-in</th><th>Me porosi</th><th>Njësi / orë</th></tr></thead><tbody>
    ${days.map(d=>{ const P=ckPeople(d, sched).people, s=k=>P.reduce((a,p)=>a+(+p[k]||0),0), hh=s('activeH');
      return `<tr><td data-sort="${d}"><a href="#" data-ckd="${d}">${h(fmtDateAl(d))}</a></td><td>${P.length}</td><td>${s('s')}</td><td>${s('units')}</td><td>${s('o')} <span class="faint">(${ckPct(s('o'),s('units'))})</span></td><td>${hh? ckR(s('units')/hh) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="hint">Kliko një datë për detajet. Check-in sipas ditës dhe orës së skanimit.</div></div>`;
}
document.addEventListener('click', e=>{ const a=e.target.closest && e.target.closest('[data-ckd]'); if(!a) return; e.preventDefault(); ckDate=a.dataset.ckd; const i=$('#ckDate'); if(i) i.value=ckDate; ckDraw(); window.scrollTo(0,0); });
