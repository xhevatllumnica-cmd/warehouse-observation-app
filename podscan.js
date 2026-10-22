/* =========================================================================
   POD (skanime) (the warehouse lead, 22.10.2026) — same layout as Picking / Check-in / Check-out / Mapp: the orders scanned for
   the couriers (Delivery Platform "Accept Delivery → Scanned Orders") per day, shift and operator, scans per hour and per
   courier post. Source: the agent's /pod/scans (reads the platform, read-only; only the scanner's name, the time and counts
   reach the app — no customer data). The scanner name is the account logged in on the POD scanner, so it is per-person only
   when each operator uses their own account; the staff rule (WODS.staffName) leaves out accounts that are not on the schedule.
   The shift of a person-day comes from the schedule (start before 12:00 → N1, otherwise N2; Saturday/Sunday → Weekend),
   someone not on the schedule that day by their first scan (before 14:00 → N1).
   The existing "POD — Proof of Delivery" tab (deliveries, cash, refusals) is separate.
   =======================================================================*/
let pdDate=null, pdData=null, pdSched={}, pdSeq=0;
async function renderPodScan(v){
  if(!pdDate) pdDate=todayStr();
  v.innerHTML=pagehead('POD (skanime)','Porositë e skanuara për korrierët në Delivery Platform: <b>sipas ditës, ndërrimit dhe operatorit</b>, skanime për orë dhe sipas postës së korrierit. Burimi: Delivery Platform (vetëm emri i skanuesit, ora dhe numrat). Vetëm stafi në Orarin e punës.','')
    + `<div class="card mod-ctl" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label class="small" style="display:flex;gap:6px;align-items:center">Data <input type="date" id="pdDate" value="${h(pdDate)}" max="${h(todayStr())}" style="width:auto;min-height:34px"></label>
        <button class="btn sm" id="pdToday">Sot</button><button class="btn sm" id="pdYday">Dje</button>
        <span class="small faint" id="pdAt" style="margin-left:auto"></span></div></div>
      <div id="pdBody"><div class="empty">Po lexohen të dhënat…</div></div>`;
  $('#pdDate').onchange=e=>{ if(e.target.value && e.target.value<=todayStr()){ pdDate=e.target.value; pdLoad(); } };
  $('#pdToday').onclick=()=>{ pdDate=todayStr(); $('#pdDate').value=pdDate; pdLoad(); };
  $('#pdYday').onclick=()=>{ const d=new Date(todayStr()+'T12:00:00'); d.setDate(d.getDate()-1); pdDate=fmtLocalDate(d); $('#pdDate').value=pdDate; pdLoad(); };
  if(!wmsOnAgent()){ $('#pdBody').innerHTML='<div class="empty">Hape app-in nga agjenti: http://localhost:8790/app.html</div>'; return; }
  pdLoad();
}
/* the agent returns the picked day and the 13 days before it; the first read of 14 days takes a while, then it is cached */
async function pdLoad(){
  const box=$('#pdBody'); if(!box) return; const my=++pdSeq, date=pdDate;
  box.innerHTML='<div class="empty">Po lexohen skanimet e POD nga Delivery Platform (14 ditët — hera e parë zgjat disa sekonda)…</div>';
  let j=null, err=null;
  try{ const r=await fetch('/pod/scans?date='+date,{cache:'no-store'}); j=await r.json(); if(!r.ok){ err=j&&j.error||('HTTP '+r.status); j=null; } }catch(e){ err=String(e&&e.message||e); }
  if(my!==pdSeq) return;
  if(!j){ box.innerHTML=`<div class="empty">${err==='auth_expired'? 'Sesioni i Delivery Platform ka skaduar — hap deliveryplatform.gjirafamall.com në Chrome (zgjerimi e rinovon).' : 'Skanimet e POD s\'u lexuan: '+h(err||'gabim i panjohur')}</div>`; return; }
  pdData=j; $('#pdAt').textContent= 'Delivery Platform: '+new Date(j.at).toLocaleString()+(j.complete? '' : ' · jo të plota');
  pdDraw();
}
const pdWeekend=d=>{ const w=new Date(d+'T12:00:00').getDay(); return w===0||w===6; };
async function pdSchedFor(from, to){
  const key=from+'|'+to; if(pdSched[key]) return pdSched[key];
  try{ const j=await fetch('/schedule/days?from='+from+'&to='+to,{cache:'no-store'}).then(r=>r.json()); pdSched[key]=(j&&j.days)||{}; }catch(e){ pdSched[key]={}; }
  return pdSched[key];
}
/* the day's rows, the staff rule applied, merged by person (second accounts under the person's name) */
function pdPeople(date, sched){
  const day=sched[date]||null, norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const name=fn=>{ const n=String(fn||'').replace(/\s+/g,' ').trim()||'(pa emër)'; return (window.WODS && WODS.staffName)? WODS.staffName(n, date) : n; };
  const P={}, out={excluded:0}; const get=n=>P[n]||(P[n]={name:n, n:0, f:null, l:null, hours:{}});
  pdData.days.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n){ out.excluded+=r.n||0; return; } const p=get(n);
    p.n+=+r.n||0; if(r.f && (!p.f || r.f<p.f)) p.f=r.f; if(r.l && (!p.l || r.l>p.l)) p.l=r.l; });
  pdData.hours.filter(r=>r.d===date).forEach(r=>{ const n=name(r.fn); if(!n) return; const p=get(n); p.hours[r.h]=(p.hours[r.h]||0)+(+r.n||0); });
  const sh=n=>{ if(pdWeekend(date)) return 'Weekend'; const k=day && Object.keys(day).find(x=>norm(x)===norm(n)), s=k&&day[k];
    if(s && !s.off){ const m=/^(\d{1,2})/.exec(s.start||''); return m && +m[1]<12? 'N1' : 'N2'; }
    return P[n].f && +P[n].f.slice(0,2)<14? 'N1' : 'N2'; };
  out.people=Object.values(P).map(p=>{ const hrs=Object.keys(p.hours).length;
    return Object.assign(p, {shift:sh(p.name), activeH:hrs, perHour: hrs? p.n/hrs : null}); }).sort((a,b)=>b.n-a.n);
  return out;
}
const pdPct=(a,b)=> b? Math.round(a/b*100)+'%' : '—';
const pdR=x=> x==null? '—' : (Math.round(x*10)/10).toLocaleString();
async function pdDraw(){
  const box=$('#pdBody'); if(!box || !pdData) return;
  const from=(()=>{ const d=new Date(pdDate+'T12:00:00'); d.setDate(d.getDate()-13); return fmtLocalDate(d); })();
  const sched=await pdSchedFor(from, pdDate);
  const D=pdPeople(pdDate, sched), ppl=D.people;
  const sum=(arr,k)=>arr.reduce((a,p)=>a+(+p[k]||0),0);
  const T={n:sum(ppl,'n'), h:sum(ppl,'activeH')}, all=pdData.days.filter(r=>r.d===pdDate).reduce((a,r)=>a+(+r.n||0),0);
  if(!ppl.length){ box.innerHTML=`<div class="empty">Asnjë skanim POD më ${h(fmtDateAl(pdDate))}${D.excluded? ' nga stafi në orar ('+D.excluded+' skanime nga llogari jashtë orarit)' : ''}.</div>`+pdTrend(sched); return; }
  const hrs=[...new Set(ppl.flatMap(p=>Object.keys(p.hours).map(Number)))].sort((a,b)=>a-b), byH={}; ppl.forEach(p=>Object.entries(p.hours).forEach(([k,n])=>byH[k]=(byH[k]||0)+n));
  const maxH=Math.max(1,...Object.values(byH));
  const shifts=['N1','N2','Weekend'].map(s=>{ const g=ppl.filter(p=>p.shift===s); return g.length? {s, n:g.length, scans:sum(g,'n'), h:sum(g,'activeH')} : null; }).filter(Boolean);
  box.innerHTML=`
    <div class="grid g-kpi" style="margin-bottom:12px">
      ${kpiCard(T.n.toLocaleString(), 'Porosi të skanuara për korrierët', T.h? pdR(T.n/T.h)+' skanime/orë për person' : '')}
      ${kpiCard(ppl.length.toLocaleString(), 'Operatorë (llogari) me skanime', T.h+' orë aktive gjithsej')}
      ${kpiCard(pdPct(T.n,all), 'Nga stafi në orar', T.n.toLocaleString()+' nga '+all.toLocaleString()+' skanime gjithsej')}
      ${kpiCard(hrs.length? String(hrs[0]).padStart(2,'0')+':00–'+String(hrs[hrs.length-1]).padStart(2,'0')+':59' : '—', 'Ora e skanimeve', 'nga ora e parë te e fundit me skanim')}</div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas operatorit <span class="sub">${h(fmtDateAl(pdDate))}</span></h3><div class="tablewrap"><table><thead><tr><th>Operatori</th><th>Ndërrimi</th><th>Skanime</th><th>Orë aktive</th><th>Skanime / orë</th><th>Koha</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><td><b>${h(p.name)}</b></td><td>${p.shift}</td><td>${p.n}</td><td>${p.activeH}</td><td data-sort="${p.perHour||0}"><b>${pdR(p.perHour)}</b></td><td class="small">${h(p.f||'')}${p.l&&p.l!==p.f? '–'+h(p.l) : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Skanim = një porosi e skanuar te korrieri. Emri është llogaria e hyrë në skanerin e POD — kuptimi për person vlen vetëm kur çdo operator hyn me llogarinë e vet. Skanime / orë = skanime ÷ orët me të paktën një skanim. ${D.excluded? D.excluded+' skanime nga llogari jashtë orarit nuk numërohen.' : ''}</div></div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Skanime për orë <span class="sub">ekipi dhe secili operator</span></h3>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin:8px 0 4px">${hrs.map(x=>`<div title="${String(x).padStart(2,'0')}:00 · ${byH[x]} skanime" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
        <span class="small">${byH[x]}</span><div style="width:100%;background:var(--accent);border-radius:3px 3px 0 0;height:${Math.round(byH[x]/maxH*90)}%"></div></div>`).join('')}</div>
      <div style="display:flex;gap:4px">${hrs.map(x=>`<div class="small faint" style="flex:1;text-align:center">${String(x).padStart(2,'0')}</div>`).join('')}</div>
      <div class="tablewrap" style="margin-top:10px"><table class="heat"><thead><tr><th>Operatori</th>${hrs.map(x=>`<th>${String(x).padStart(2,'0')}</th>`).join('')}<th>Gjithsej</th></tr></thead><tbody>
      ${ppl.map(p=>`<tr><th style="text-align:left">${h(p.name)}</th>${hrs.map(x=>{ const n=p.hours[x]||0; return `<td style="background:rgba(17,91,146,${(n/maxH*0.85).toFixed(2)});color:${n/maxH>0.55?'#fff':'var(--text)'}">${n||''}</td>`; }).join('')}<td><b>${p.n}</b></td></tr>`).join('')}</tbody></table></div></div>
    ${pdPosts()}
    ${pdTrend(sched)}
    <div class="card sh-card" style="margin:12px 0 0"><h3 style="margin-top:0">Sipas ndërrimit</h3><div class="tablewrap"><table><thead><tr><th>Ndërrimi</th><th>Operatorë</th><th>Skanime</th><th>Orë aktive</th><th>Skanime / orë</th></tr></thead><tbody>
      ${shifts.map(x=>`<tr><td><b>${x.s}</b></td><td>${x.n}</td><td>${x.scans}</td><td>${x.h}</td><td><b>${x.h? pdR(x.scans/x.h) : '—'}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="hint">Ndërrimi i personit nga Orari i punës (fillim para 12:00 → N1, ndryshe N2; e shtunë/e diel → Weekend); pa orar → sipas skanimit të parë.</div></div>`;
}
function pdPosts(){
  const p=pdData.posts; if(!p) return '';
  if(p.loading) return `<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas postës së korrierit</h3><div class="empty">Dorëzimet e ditës po lexohen nga Delivery Platform (10–20 sek) — rihap datën pas pak.</div></div>`;
  const tot=p.posts.reduce((a,x)=>a+x.n,0)+p.other+p.unknown;
  return `<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Sipas postës së korrierit</h3><div class="tablewrap"><table style="max-width:420px"><thead><tr><th>Posta</th><th>Skanime</th><th>Pjesa</th></tr></thead><tbody>
    ${p.posts.map(x=>`<tr><td>${h(x.name)}</td><td>${x.n}</td><td>${pdPct(x.n,tot)}</td></tr>`).join('')}<tr><td>Të tjera</td><td>${p.other}</td><td>${pdPct(p.other,tot)}</td></tr>${p.unknown? `<tr><td>Pa dorëzim të gjetur</td><td>${p.unknown}</td><td>${pdPct(p.unknown,tot)}</td></tr>` : ''}</tbody></table></div>
    <div class="hint">Skanimi s'e njeh korrierin; çdo porosi e skanuar kërkohet te dorëzimet e ditës (sipas porosisë dhe platformës). Të gjitha llogaritë.</div></div>`;
}
function pdTrend(sched){
  const days=[...new Set(pdData.days.map(r=>r.d))].filter(d=>d<=pdDate).sort().slice(-14).reverse(); if(!days.length) return '';
  return `<div class="card mon-hide"><h3 style="margin-top:0">14 ditët e fundit</h3><div class="tablewrap"><table><thead><tr><th>Data</th><th>Operatorë</th><th>Skanime</th><th>Orë aktive</th><th>Skanime / orë</th></tr></thead><tbody>
    ${days.map(d=>{ const P=pdPeople(d, sched).people, s=k=>P.reduce((a,p)=>a+(+p[k]||0),0), hh=s('activeH');
      return `<tr><td data-sort="${d}"><a href="#" data-pdd="${d}">${h(fmtDateAl(d))}</a></td><td>${P.length}</td><td>${s('n')}</td><td>${hh||'—'}</td><td>${hh? pdR(s('n')/hh) : '—'}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="hint">Kliko një datë për detajet (orët për orë lexohen për datën e zgjedhur). Skanime sipas ditës dhe orës së skanimit.</div></div>`;
}
document.addEventListener('click', e=>{ const a=e.target.closest && e.target.closest('[data-pdd]'); if(!a) return; e.preventDefault(); pdDate=a.dataset.pdd; const i=$('#pdDate'); if(i) i.value=pdDate; pdLoad(); window.scrollTo(0,0); });
