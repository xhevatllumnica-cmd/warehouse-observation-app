/* =========================================================================
   CHECK-OUT (the warehouse lead, 22.10.2026) — same layout as Picking / Check-in: the units checked out and the orders
   packed per day, shift and operator, check-outs per hour and per platform. Source: WMS Pulse block E (coH / coS / coP —
   ProductLogs LogTypeId 4 / 18, read-only SQL, refreshed every hour 07–22). A check-out = one unit scanned out for an order
   (one log row); an order counts once per account that checked a unit of it out.
   People: the staff on "Orari i punës" (WODS.staffName — the same rule as every list); the shift of a person-day comes from the
   schedule (start before 12:00 → N1, otherwise N2; Saturday/Sunday → Weekend), someone not on the schedule that day by their
   first check-out (before 14:00 → N1).
   =======================================================================*/
let coDate=null, coData=null, coSched={};
async function renderCheckout(v){
  if(!coDate) coDate=todayStr();
  v.innerHTML=pagehead('Check-out','Dërgimi i porosive nga magazina në WMS: <b>sipas ditës, ndërrimit dhe operatorit</b>, njësi dhe porosi të dërguara, check-out për orë dhe sipas platformës. Burimi: WMS (log-u i check-out), rifreskohet çdo orë 07–22. Vetëm stafi në Orarin e punës.','')
    + `<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label class="small" style="display:flex;gap:6px;align-items:center">Data <input type="date" id="coDate" value="${h(coDate)}" max="${h(todayStr())}" style="width:auto;min-height:34px"></label>
        <button class="btn sm" id="coToday">Sot</button><button class="btn sm" id="coYday">Dje</button>
        <span class="small faint" id="coAt" style="margin-left:auto"></span></div></div>
      <div id="coBody"><div class="empty">Po lexohen të dhënat…</div></div>`;
  $('#coDate').onchange=e=>{ if(e.target.value && e.target.value<=todayStr()){ coDate=e.target.value; coDraw(); } };
  $('#coToday').onclick=()=>{ coDate=todayStr(); $('#coDate').value=coDate; coDraw(); };
  $('#coYday').onclick=()=>{ const d=new Date(todayStr()+'T12:00:00'); d.setDate(d.getDate()-1); coDate=fmtLocalDate(d); $('#coDate').value=coDate; coDraw(); };
  if(!wmsOnAgent()){ $('#coBody').innerHTML='<div class="empty">Hape app-in nga agjenti: http://localhost:8790/app.html</div>'; return; }
  try{ const j=await fetch('/pulse/data',{cache:'no-store'}).then(r=>r.json()); coData=j.checkout||null; }catch(e){ coData=null; }
  if(!coData){ $('#coBody').innerHTML='<div class="empty">Të dhënat e check-out ende s\'janë lexuar nga WMS (blloku E i WMS Pulse) — vijnë me rifreskimin e radhës (çdo orë 07–22).</div>'; return; }
  $('#coAt').textContent= coData.at? 'WMS: '+new Date(coData.at).toLocaleString() : '';
  coDraw();
}
const coWeekend=d=>{ const w=new Date(d+'T12:00:00').getDay(); return w===0||w===6; };
async function coSchedFor(from, to){
  const key=from+'|'+to; if(coSched[key]) return coSched[key];
  try{ const j=await fetch('/schedule/days?from='+from+'&to='+to,{cache:'no-store'}).then(r=>r.json()); coSched[key]=(j&&j.days)||{}; }catch(e){ coSched[key]={}; }
  return coSched[key];
}
/* the day's rows, the staff rule applied, merged by person (second accounts under the person's name) */
function coPeople(date, sched){
  const day=sched[date]||null, norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const name=fn=>{ const n=String(fn||'').replace(/\s+/g,' ').trim()||'(pa emër)'; return (window.WODS && WODS.staffName)? WODS.staffName(n, date) : n; };
  const P={}, out={excluded:0}; const get=n=>P[n]||(P[n]={name:n, n:0, o:0, g:0, f:null, l:null, hours:{}});
  coData.days.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n){ out.excluded+=r.n||0; return; } const p=get(n);
    ['n','o','g'].forEach(k=>p[k]+=+r[k]||0); if(r.f && (!p.f || r.f<p.f)) p.f=r.f; if(r.l && (!p.l || r.l>p.l)) p.l=r.l; });
  coData.hours.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n) return; const p=get(n); p.hours[r.h]=(p.hours[r.h]||0)+(+r.n||0); });
  const sh=n=>{ if(coWeekend(date)) return 'Weekend'; const k=day && Object.keys(day).find(x=>norm(x)===norm(n)), s=k&&day[k];
    if(s && !s.off){ const m=/^(\d{1,2})/.exec(s.start||''); return m && +m[1]<12? 'N1' : 'N2'; }
    const first=Math.min(...Object.keys(P[n].hours).map(Number)); return isFinite(first)? (first<14? 'N1' : 'N2') : (P[n].f && +P[n].f.slice(0,2)<14? 'N1' : 'N2'); };
  out.people=Object.values(P).map(p=>{ const hrs=Object.keys(p.hours).length, units=Object.values(p.hours).reduce((a,b)=>a+b,0);
    return Object.assign(p, {shift:sh(p.name), activeH:hrs, units, perHour: hrs? units/hrs : null, ordPerHour: hrs? p.o/hrs : null}); })
    .sort((a,b)=>b.units-a.units || b.o-a.o);
  return out;
}
const coPct=(a,b)=> b? Math.round(a/b*100)+'%' : '—';
const coR=x=> x==null? '—' : (Math.round(x*10)/10).toLocaleString();
async function coDraw(){
  const box=$('#coBody'); if(!box || !coData) return;
  const from=(()=>{ const d=new Date(coDate+'T12:00:00'); d.setDate(d.getDate()-13); return fmtLocalDate(d); })();
  const sched=await coSchedFor(from, coDate);
  const D=coPeople(coDate, sched), ppl=D.people;
  const sum=(arr,k)=>arr.reduce((a,p)=>a+(+p[k]||0),0);
  const T={units:sum(ppl,'units'), o:sum(ppl,'o'), g:sum(ppl,'g'), h:sum(ppl,'activeH')};
  if(!ppl.length){ box.innerHTML=`<div class="empty">Asnjë check-out më ${h(fmtDateAl(coDate))}${D.excluded? ' nga stafi në orar ('+D.excluded+' njësi nga llogari jashtë orarit)' : ''}.</div>`+coTrend(sched); return; }
  const hrs=[...new Set(ppl.flatMap(p=>Object.keys(p.hours).map(Number)))].sort((a,b)=>a-b), byH={}; ppl.forEach(p=>Object.entries(p.hours).forEach(([k,n])=>byH[k]=(byH[k]||0)+n));
  const maxH=Math.max(1,...Object.values(byH));
  const shifts=['N1','N2','Weekend'].map(s=>{ const g=ppl.filter(p=>p.shift===s); return g.length? {s, n:g.length, o:sum(g,'o'), units:sum(g,'units'), h:sum(g,'activeH')} : null; }).filter(Boolean);
  box.innerHTML=`
    <div class="grid g-kpi" style="margin-bottom:12px">
      ${kpiCard(T.units.toLocaleString(), 'Check-out (njësi të dërguara)', T.h? coR(T.units/T.h)+' njësi/orë për person' : '')}
      ${kpiCard(T.o.toLocaleString(), 'Porosi të kontrolluara', ppl.length+' operatorë · '+(T.o? coR(T.units/T.o)+' njësi për porosi' : ''))}
      ${kpiCard(coPct(T.g,T.o), 'Porosi Gjirafa50', T.g.toLocaleString()+' nga '+T.o.toLocaleString()+' (Mall: '+(T.o-T.g).toLocaleString()+')')}
      ${kpiCard(T.h? coR(T.o/T.h) : '—', 'Porosi / orë për person', T.h+' orë aktive gjithsej')}</div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas ndërrimit</h3><div class="tablewrap"><table><thead><tr><th>Ndërrimi</th><th>Operatorë</th><th>Porosi</th><th>Check-out</th><th>Orë aktive</th><th>Njësi / orë</th><th>Porosi / orë</th></tr></thead><tbody>
      ${shifts.map(x=>`<tr><td><b>${x.s}</b></td><td>${x.n}</td><td>${x.o}</td><td>${x.units}</td><td>${x.h}</td><td><b>${x.h? coR(x.units/x.h) : '—'}</b></td><td>${x.h? coR(x.o/x.h) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Ndërrimi i personit nga Orari i punës (fillim para 12:00 → N1, ndryshe N2; e shtunë/e diel → Weekend); pa orar → sipas check-out-it të parë.</div></div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas operatorit <span class="sub">${h(fmtDateAl(coDate))}</span></h3><div class="tablewrap"><table><thead><tr><th>Operatori</th><th>Ndërrimi</th><th>Porosi</th><th>Check-out</th><th>Gjirafa50</th><th>Orë aktive</th><th>Njësi / orë</th><th>Porosi / orë</th><th>Koha</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><td><b>${h(p.name)}</b></td><td>${p.shift}</td><td>${p.o}</td><td>${p.units}</td><td data-sort="${p.o? p.g/p.o : 0}">${p.g} <span class="faint">(${coPct(p.g,p.o)})</span></td><td>${p.activeH}</td>
        <td data-sort="${p.perHour||0}"><b>${coR(p.perHour)}</b></td><td data-sort="${p.ordPerHour||0}">${coR(p.ordPerHour)}</td><td class="small">${h(p.f||'')}${p.l&&p.l!==p.f? '–'+h(p.l) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Check-out = njësi të skanuara për një porosi (çdo rresht i log-ut një njësi). Porosi = porositë e ndryshme që personi preku; një porosi e përpunuar nga dy persona numërohet për secilin. Njësi / orë = check-out ÷ orët me të paktën një skanim. ${D.excluded? D.excluded+' njësi nga llogari jashtë orarit nuk numërohen.' : ''}</div></div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Check-out për orë <span class="sub">ekipi dhe secili operator</span></h3>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin:8px 0 4px">${hrs.map(x=>`<div title="${String(x).padStart(2,'0')}:00 · ${byH[x]} check-out" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
        <span class="small">${byH[x]}</span><div style="width:100%;background:var(--accent);border-radius:3px 3px 0 0;height:${Math.round(byH[x]/maxH*90)}%"></div></div>`).join('')}</div>
      <div style="display:flex;gap:4px">${hrs.map(x=>`<div class="small faint" style="flex:1;text-align:center">${String(x).padStart(2,'0')}</div>`).join('')}</div>
      <div class="tablewrap" style="margin-top:10px"><table class="heat"><thead><tr><th>Operatori</th>${hrs.map(x=>`<th>${String(x).padStart(2,'0')}</th>`).join('')}<th>Gjithsej</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><th style="text-align:left">${h(p.name)}</th>${hrs.map(x=>{ const n=p.hours[x]||0; return `<td style="background:rgba(17,91,146,${(n/maxH*0.85).toFixed(2)});color:${n/maxH>0.55?'#fff':'var(--text)'}">${n||''}</td>`; }).join('')}<td><b>${p.units}</b></td></tr>`).join('')}</tbody></table></div></div>
    ${coPlatforms()}
    ${coTrend(sched)}`;
}
function coPlatforms(){
  const rows=(coData.platforms||[]).filter(r=>r.d===coDate).sort((a,b)=>a.p-b.p); if(!rows.length) return '';
  const nm=p=> p===2? 'Gjirafa50' : p===1? 'Gjirafa Mall' : 'Platforma '+p;
  return `<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas platformës</h3><div class="tablewrap"><table style="max-width:520px"><thead><tr><th>Platforma</th><th>Porosi</th><th>Njësi të dërguara</th><th>Njësi / porosi</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${h(nm(r.p))}</td><td>${r.o}</td><td>${r.n}</td><td>${r.o? coR(r.n/r.o) : '—'}</td></tr>`).join('')}</tbody></table></div><div class="hint">Porositë e magazinës 01, të gjitha llogaritë (një porosi numërohet një herë, jo për person).</div></div>`;
}
function coTrend(sched){
  const days=[...new Set(coData.days.map(r=>r.d))].filter(d=>d<=coDate).sort().slice(-14).reverse(); if(!days.length) return '';
  return `<div class="card"><h3 style="margin-top:0">14 ditët e fundit</h3><div class="tablewrap"><table><thead><tr><th>Data</th><th>Operatorë</th><th>Porosi</th><th>Check-out</th><th>Gjirafa50</th><th>Njësi / orë</th></tr></thead><tbody>
    ${days.map(d=>{ const P=coPeople(d, sched).people, s=k=>P.reduce((a,p)=>a+(+p[k]||0),0), hh=s('activeH');
      return `<tr><td data-sort="${d}"><a href="#" data-cod="${d}">${h(fmtDateAl(d))}</a></td><td>${P.length}</td><td>${s('o')}</td><td>${s('units')}</td><td>${s('g')} <span class="faint">(${coPct(s('g'),s('o'))})</span></td><td>${hh? coR(s('units')/hh) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="hint">Kliko një datë për detajet. Check-out sipas ditës dhe orës së skanimit.</div></div>`;
}
document.addEventListener('click', e=>{ const a=e.target.closest && e.target.closest('[data-cod]'); if(!a) return; e.preventDefault(); coDate=a.dataset.cod; const i=$('#coDate'); if(i) i.value=coDate; coDraw(); window.scrollTo(0,0); });
