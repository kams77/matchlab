(function(){
'use strict';
const E=window.ML,fr=E.fr;
const KEY='matchlab.v2';
const CTX={normal:{l:'Normal',f:1},derby:{l:'Derby / rivalité',f:1.12},enjeu:{l:'Gros enjeu (titre, maintien, coupe)',f:1.06},relache:{l:'Sans enjeu',f:0.92}};
const MK={y:{t:'Cartons',cls:'mk mk-card',txt:'',color:'var(--yellow)',kmax:12},c:{t:'Corners',cls:'mk mk-corner',txt:'',color:'var(--red)',kmax:20},g2:{t:'Buts 2ᵉ MT',cls:'mk mk-half',txt:'2ᵉ',color:'var(--pitch)',kmax:6}};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=p=>p==null?'—':(p*100).toLocaleString('fr-FR',{maximumFractionDigits:0})+' %';
const odd=p=>p>0.001?(1/p).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const NATIVE=window.MatchlabNative||null;
function storeGet(){try{if(NATIVE&&NATIVE.loadData){const t=NATIVE.loadData(KEY);if(t)return JSON.parse(t)}}catch(e){}try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}}
function storeSet(txt){if(NATIVE&&NATIVE.saveData){try{if(NATIVE.saveData(KEY,txt)==='ok')return true}catch(e){}}localStorage.setItem(KEY,txt);return true}
const dstr=t=>new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});

/* ---------- État ---------- */
let state=(()=>{let s=storeGet();if(!s||typeof s!=='object')s={};
  s.ds=Array.isArray(s.ds)?s.ds:[];if(s.demo===undefined)s.demo=true;s.fx=Array.isArray(s.fx)?s.fx:[];
  s.cfg=Object.assign({hl:180,k:6,kr:8,N:20000,mkt:true},s.cfg||{});s.track=Array.isArray(s.track)?s.track:[];s.combo=Array.isArray(s.combo)?s.combo:[];
  s.sel=Object.assign({period:'7',div:'',m:'',conf:'f'},s.sel||{});s.thr=s.thr||72;s.odds=s.odds||{};s.calib=s.calib||'y';
  s.auto=Object.assign({divs:['E0','F1','SP1','I1','D1','N1','P1','B1'],last:0},s.auto||{});return s})();
let saveFailed=false;
function save(){try{storeSet(JSON.stringify(state));saveFailed=false}catch(e){saveFailed=true}}
const pack=r=>[r.div,r.t,r.h,r.a,r.hg1,r.ag1,r.hg2,r.ag2,r.hc,r.ac,r.hy,r.ay,r.ref||'',r.md==null?null:r.md,r.mo==null?null:r.mo];
const unpack=a=>({div:a[0],t:a[1],h:a[2],a:a[3],hg1:a[4],ag1:a[5],hg2:a[6],ag2:a[7],hc:a[8],ac:a[9],hy:a[10],ay:a[11],ref:a[12],md:a[13]==null?null:a[13],mo:a[14]==null?null:a[14]});

let DATA={},FITC=new Map(),MCC=new Map(),BT=null,btJob=0;
const divName=d=>E.DIVN[d]||d;
const cfgKey=()=>[state.cfg.hl,state.cfg.k,state.cfg.kr,state.cfg.mkt].join(',');
function rebuild(){
  DATA={};const seen=new Set();
  const add=r=>{const k=r.div+'|'+r.t+'|'+r.h+'|'+r.a;if(seen.has(k))return;seen.add(k);(DATA[r.div]=DATA[r.div]||[]).push(r)};
  if(state.demo)E.demoRows().forEach(add);
  state.ds.forEach(d=>d.rows.forEach(a=>add(unpack(a))));
  for(const k in DATA)DATA[k].sort((x,y)=>x.t-y.t);
  FITC.clear();MCC.clear();
  if(!state.fx.length&&DATA.DEMO){
    [['Lions FC','Aigles SC','Arbitre 03','derby'],['Atlético Riverside','Union Portuaire','Arbitre 07','normal'],['FC Montagne','Racing Delta','Arbitre 11','enjeu']]
      .forEach(([h,a,ref,ctx],i)=>state.fx.push({id:'ex'+i,div:'DEMO',h,a,ref,ctx,date:today()}));
    state.cur='ex0';save();
  }
  settle();
  startBacktest();
}
function getFit(div,ts){const k=div+'|'+ts+'|'+cfgKey();if(!FITC.has(k))FITC.set(k,DATA[div]?E.fit(DATA[div],ts,state.cfg):null);return FITC.get(k)}
const fxTs=fx=>{const t=E.parseDate(fx.date);return isFinite(t)?t:E.parseDate(today())};
function analyzeFx(fx){if(!fx||!DATA[fx.div])return null;const F=getFit(fx.div,fxTs(fx));if(!F)return null;
  const P=E.predict(F,fx.h,fx.a,fx.ref,(CTX[fx.ctx]||CTX.normal).f,state.cfg.mkt?{md:fx.md,mo:fx.mo}:null);return {F,P,M:E.markets(P,fx.h,fx.a)}}
const curFx=()=>state.fx.find(f=>f.id===state.cur)||state.fx[0];

/* ---------- Validation historique (walk-forward) ---------- */
function startBacktest(){
  const job=++btJob;BT={status:'run',prog:0,P:[],O:[],meta:[]};
  const tasks=[];for(const div in DATA){const rows=DATA[div],from=rows[rows.length-1].t-400*864e5;const days=[...new Set(rows.filter(r=>r.t>=from).map(r=>r.t))];days.forEach(t=>tasks.push([div,t]))}
  let i=0;renderStatus();
  const step=()=>{if(job!==btJob)return;const end=Math.min(tasks.length,i+12);
    for(;i<end;i++){const [div,t]=tasks[i],rows=DATA[div],F=E.fit(rows,t,state.cfg);if(!F)continue;
      for(const r of rows){if(r.t<t)continue;if(r.t>t)break;const th=F.teams[r.h],ta=F.teams[r.a];if(!th||!ta||th.n<5||ta.n<5)continue;
        const M=E.markets(E.predict(F,r.h,r.a,r.ref,1,state.cfg.mkt?r:null),r.h,r.a);BT.P.push(E.KEYS.map(k=>M.byKey[k].p));BT.O.push(E.KEYS.map(k=>E.outcome(k,r)));BT.meta.push(div)}}
    BT.prog=tasks.length?i/tasks.length:1;renderStatus();
    if(i<tasks.length)setTimeout(step,0);else{BT.status='done';renderStatus();renderView()}};
  setTimeout(step,20);
}
function reliability(k,p){if(!BT||BT.status!=='done')return null;const j=E.KEYS.indexOf(k);if(j<0)return null;let n=0,h=0;
  for(let i=0;i<BT.P.length;i++){if(Math.abs(BT.P[i][j]-p)<=.06){n++;h+=BT.O[i][j]}}return {n,r:n?h/n:null}}
function confidence(p,rel,nmin){
  if(rel&&rel.n>=25&&rel.r>=p-.05&&nmin>=8)return 'h';
  if(rel&&rel.n>=10&&rel.r>=p-.10&&nmin>=5)return 'm';
  if(!rel&&p>=.75&&nmin>=10)return 'm';return 'f';
}
const CONF={h:['Élevée','c-h'],m:['Moyenne','c-m'],f:['Faible','c-f']};
const chip=c=>`<span class="chip ${CONF[c][1]}">${CONF[c][0]}</span>`;
const pcell=(p,hot)=>`<div class="pc${hot?' hot':''}"><i style="width:${(p*100).toFixed(1)}%"></i><span>${pct(p)}</span><em>@${odd(p)}</em></div>`;
const relTxt=rel=>!rel?'Historique en calcul…':rel.n<5?'Historique insuffisant':`Historique : ${pct(rel.r)} réussis sur ${rel.n.toLocaleString('fr-FR')} cas comparables`;

/* ---------- En-tête ---------- */
function renderStatus(){
  const n=Object.values(DATA).reduce((s,r)=>s+r.length,0),ln=Object.keys(DATA).length;
  let bt='';
  if(BT&&BT.status==='run')bt=`<span>Validation <span class="prog"><i style="width:${(BT.prog*100).toFixed(0)}%"></i></span></span>`;
  else if(BT&&BT.status==='done')bt=`<span>Validé sur <b>${BT.P.length.toLocaleString('fr-FR')}</b> matchs</span>`;
  if(typeof updating!=='undefined'&&updating)bt=`<span><b>${esc(autoMsg||'Mise à jour…')}</b></span>`;
  $('status').innerHTML=n?`<span>Base : <b>${n.toLocaleString('fr-FR')}</b> matchs · <b>${ln}</b> championnat${ln>1?'s':''}${state.demo?' (dont démo simulée)':''}</span>${bt}`:'<span>Aucune donnée chargée</span>';
}

/* ---------- Analyse ---------- */
function fillBuilder(){
  const divs=Object.keys(DATA);const bd=$('b-div');const prev=bd.value;
  bd.innerHTML=divs.map(d=>`<option value="${esc(d)}">${esc(divName(d))} (${DATA[d].length} matchs)</option>`).join('')||'<option value="">Aucune donnée</option>';
  if(divs.includes(prev))bd.value=prev;else if(curFx()&&divs.includes(curFx().div))bd.value=curFx().div;
  fillTeams();
  $('b-ctx').innerHTML=Object.entries(CTX).map(([k,v])=>`<option value="${k}">${v.l}</option>`).join('');
  if(!$('b-date').value)$('b-date').value=today();
}
function fillTeams(){
  const d=$('b-div').value,rows=DATA[d]||[];
  const last=rows.length?rows[rows.length-1].t:0,recent=new Set(rows.filter(r=>r.t>last-200*864e5).flatMap(r=>[r.h,r.a]));
  const teams=[...new Set(rows.flatMap(r=>[r.h,r.a]))].sort((a,b)=>(recent.has(b)-recent.has(a))||a.localeCompare(b,'fr'));
  const opts=teams.map(t=>`<option value="${esc(t)}">${esc(t)}${recent.has(t)?'':' (ancienne saison)'}</option>`).join('');
  $('b-h').innerHTML=opts;$('b-a').innerHTML=opts;if(teams.length>1)$('b-a').selectedIndex=1;
  const F=rows.length?getFit(d,rows[rows.length-1].t+864e5):null;
  const refs=F?Object.entries(F.ref).sort((a,b)=>b[1].n-a[1].n):[];
  $('b-ref').innerHTML='<option value="">Arbitre inconnu</option>'+refs.map(([n,o])=>`<option value="${esc(n)}">${esc(n)} · ${fr(o.avg)} cartons/m · ${o.n} m</option>`).join('');
}
function renderFxList(){
  $('fx-list').innerHTML=state.fx.map(fx=>{const A=analyzeFx(fx);
    const s=A?`${fr(A.P.y.lt)} cartons · ${fr(A.P.c.lt)} corners · ${fr(A.P.g2.lt,2)} buts 2ᵉ MT`:'Données indisponibles';
    return `<li><button type="button" data-fx="${fx.id}" aria-current="${fx.id===(curFx()||{}).id}"><span class="t">${esc(fx.h)} – ${esc(fx.a)}</span><span class="s">${esc(divName(fx.div))} · ${esc(fx.date)}</span><span class="s num">${s}</span></button></li>`}).join('')
    ||'<li class="sub">Aucune rencontre. Choisissez deux équipes ci-dessus.</li>';
}
function hist(m,A,sim){
  const W=300,H=96,pad=14,kmax=MK[m].kmax,n=kmax+1,bw=(W-8)/n;
  const dist=sim?sim[m].hist.slice(0,n):A.M.D[m].slice(0,n);const mx=Math.max(...dist,1e-9);
  const b=bestLine(A.M.groups[m]),L=b?b.line:Math.floor(A.P[m].lt);
  let s=`<svg class="hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution simulée du total">`;
  for(let k=0;k<n;k++){const p=dist[k]||0,h=(H-pad-6)*p/mx,x=4+k*bw,inSide=b&&(b.side==='u'?k<L:k>L);
    s+=`<rect x="${(x+1).toFixed(1)}" y="${(H-pad-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" rx="1.5" fill="${inSide?MK[m].color:'var(--bar)'}"><title>${k}${k===kmax?'+':''} : ${pct(p)}</title></rect>`;
    if(n<=8||k%2===0)s+=`<text x="${(x+bw/2).toFixed(1)}" y="${H-3}" text-anchor="middle">${k}${k===kmax?'+':''}</text>`}
  const mxp=4+(A.P[m].lt+.5)*bw;if(mxp<W)s+=`<line x1="${mxp.toFixed(1)}" x2="${mxp.toFixed(1)}" y1="2" y2="${H-pad}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 2"/>`;
  return s+'</svg>';
}
function bestLine(opts){const ou=opts.filter(o=>!o.extra);const ok=ou.filter(o=>o.p>=.7&&o.p<.97).sort((x,y)=>x.p-y.p);return ok[0]||ou.slice().sort((x,y)=>y.p-x.p)[0]}
function panel(m,A,fx,sim){
  const g=A.M.groups[m],b=bestLine(g),thr=state.thr/100,nmin=Math.min(A.P.nh,A.P.na),rel=reliability(b.k,b.p);
  const rows=E.LINES[m].map(L=>{const o=A.M.byKey[m+'|o|'+L],u=A.M.byKey[m+'|u|'+L];return `<tr><td class="line">${fr(L)}</td><td>${pcell(o.p,o.p>=thr)}</td><td>${pcell(u.p,u.p>=thr)}</td></tr>`}).join('');
  const extras=g.filter(o=>o.extra).map(o=>`<div class="extra"><span>${esc(o.label)}</span>${pcell(o.p,o.p>=thr)}</div>`).join('');
  let simTxt='Simulation en cours…';
  if(sim){const gap=Math.max(...E.LINES[m].map(L=>Math.abs(sim[m].over[L]-A.M.byKey[m+'|o|'+L].p)));simTxt=`Fourchette à 90 % : ${sim[m].p5} à ${sim[m].p95} · écart calcul/simulation ${fr(gap*100)} pt`}
  const sel=(state.odds[fx.id+'|'+m]||{});
  let note='';if(m==='y')note=A.P.ref?`Arbitre : ${fr(A.P.ref.avg)} cartons/match sur ${A.P.ref.n} matchs, sévérité ×${fr(A.P.ref.mul,2)}`:'Arbitre inconnu : sévérité moyenne de la ligue';
  if(m==='g2')note=`1ʳᵉ MT attendue : ${fr(A.P.g1.lt,2)} but(s)`;
  return `<article class="panel p-${m}">
    <header><span class="${MK[m].cls}" aria-hidden="true">${MK[m].txt}</span><h3>${MK[m].t}</h3><span class="exp">Total attendu<b>${fr(A.P[m].lt,m==='g2'?2:1)}</b></span></header>
    <div class="verdict"><div><small>Ligne conseillée</small><span class="v-l">${esc(b.label)}</span><div class="v-h">${chip(confidence(b.p,rel,nmin))}<span>${relTxt(rel)}</span></div></div><span class="v-p">${pct(b.p)}</span></div>
    ${hist(m,A,sim)}
    <div class="sub" style="margin-top:-6px">${esc(fx.h)} ${fr(A.P[m].lh,2)} · ${esc(fx.a)} ${fr(A.P[m].la,2)}${note?' · '+esc(note):''}</div>
    <div class="sub">${simTxt}</div>
    <table><thead><tr><th>Ligne</th><th>Plus de</th><th>Moins de</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="extras">${extras}</div>
    <div class="value"><label class="group-label" for="v-${m}-sel">Comparer à la cote du bookmaker</label>
      <div class="vrow"><select id="v-${m}-sel" data-m="${m}">${g.map(o=>`<option value="${o.k}"${o.k===(sel.k||b.k)?' selected':''}>${esc(o.label)}</option>`).join('')}</select>
      <input id="v-${m}-odd" data-m="${m}" type="number" inputmode="decimal" min="1.01" step="0.01" placeholder="Cote" value="${esc(sel.o||'')}" aria-label="Cote du bookmaker"></div>
      <div class="vres" id="v-${m}-res"></div></div>
  </article>`;
}
function valueRes(m,A,fx){
  const k=$(`v-${m}-sel`).value,c=parseFloat(String($(`v-${m}-odd`).value).replace(',','.')),o=A.M.byKey[k],out=$(`v-${m}-res`);
  if(!o)return;if(!(c>1)){out.innerHTML=`Probabilité ${pct(o.p)} · cote juste <b>${odd(o.p)}</b>. Entrez la cote proposée pour mesurer la value.`;return}
  const edge=o.p*c-1;let t=`Le bookmaker estime ${pct(1/c)}, le modèle ${pct(o.p)}. `;
  if(edge>.03){const kel=Math.min(.05,edge/(c-1)/4);t+=`<b class="pos">Value +${fr(edge*100)} %</b> · mise ¼ Kelly : ${fr(kel*100)} % de la bankroll`}
  else if(edge>-.03)t+='<b>Cote proche du juste prix</b>';else t+=`<b class="neg">Pas de value (${fr(edge*100)} %)</b>`;
  out.innerHTML=t;
}
function realResult(fx){const rows=DATA[fx.div]||[],t=fxTs(fx);return rows.find(r=>r.t===t&&r.h===fx.h&&r.a===fx.a)}
function renderAnalysis(){
  const fx=curFx(),box=$('analysis');
  if(!fx){box.innerHTML=`<div class="card empty">Choisissez un championnat et deux équipes, puis « Analyser ce match ». Sans données, importez une saison dans l’onglet <a href="#donnees">Données</a>.</div>`;return}
  const A=analyzeFx(fx);
  if(!A){box.innerHTML=`<div class="card empty">Pas assez de matchs dans la base avant le ${esc(fx.date)} pour « ${esc(divName(fx.div))} ». Importez une saison antérieure ou changez la date.</div>${actions()}`;bindActions(fx);return}
  const nmin=Math.min(A.P.nh,A.P.na),real=realResult(fx);
  const mcKey=[fx.id,fx.h,fx.a,fx.ref,fx.ctx,fx.date,cfgKey(),state.cfg.N,state.demo,state.ds.length].join('|');
  const sim=MCC.get(mcKey);
  box.innerHTML=`<div class="match-head">
    <div class="fixture"><div class="team"><small>DOMICILE · ${A.P.nh} MATCHS</small>${esc(fx.h)}</div>
      <div class="xg"><div class="score">${fr(A.P.g1.lh+A.P.g2.lh,2)} – ${fr(A.P.g1.la+A.P.g2.la,2)}</div><small>buts attendus</small></div>
      <div class="team away"><small>EXTÉRIEUR · ${A.P.na} MATCHS</small>${esc(fx.a)}</div></div>
    <div class="meta"><span>${esc(divName(fx.div))}</span><span>${esc(fx.date)}</span><span>Contexte : <b>${(CTX[fx.ctx]||CTX.normal).l}</b></span><span>Base : <b>${A.F.n.toLocaleString('fr-FR')} matchs</b> du ${dstr(A.F.first)} au ${dstr(A.F.last)}</span><span>Simulations : <b>${state.cfg.N.toLocaleString('fr-FR')}</b></span><span>Cotes du marché : <b>${A.P.mkt?'intégrées':fx.md!=null?'base sans cotes':'non saisies'}</b></span></div>
    ${nmin<5?`<div class="warn">Une des équipes compte moins de 5 matchs dans la base : ses notes restent proches de la moyenne de la ligue.</div>`:''}
    ${real?`<div class="real"><b>Résultat réel</b> : ${real.hg1+real.hg2}-${real.ag1+real.ag2} (2ᵉ MT ${real.hg2}-${real.ag2}) · ${real.hc+real.ac} corners · ${real.hy+real.ay} cartons. Le modèle n’a utilisé que les matchs antérieurs.</div>`:''}
    ${actions()}</div>
    <div class="panels">${['y','c','g2'].map(m=>panel(m,A,fx,sim)).join('')}</div>
    ${profileTable(fx,A)}`;
  ['y','c','g2'].forEach(m=>{const up=()=>{state.odds[fx.id+'|'+m]={k:$(`v-${m}-sel`).value,o:$(`v-${m}-odd`).value};save();valueRes(m,A,fx)};
    $(`v-${m}-sel`).addEventListener('change',up);$(`v-${m}-odd`).addEventListener('input',up);valueRes(m,A,fx)});
  bindActions(fx);
  if(!sim)setTimeout(()=>{if(curFx()!==fx)return;MCC.set(mcKey,E.simulate(A.F,fx,A.P,state.cfg.N));if(curFx()===fx&&location.hash.replace('#','')!=='donnees')renderAnalysis()},30);
}
function actions(){return `<div class="head-actions"><button type="button" id="a-del" class="danger">Retirer de la liste</button></div>`}
function bindActions(fx){const b=$('a-del');if(!b)return;let t;b.onclick=()=>{if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Confirmer le retrait';t=setTimeout(()=>{b.classList.remove('armed');b.textContent='Retirer de la liste'},4000);return}
  clearTimeout(t);state.fx=state.fx.filter(f=>f.id!==fx.id);state.cur=state.fx[0]&&state.fx[0].id;save();renderView()}}
function profileTable(fx,A){
  const rows=DATA[fx.div],t=fxTs(fx),ph=E.profile(rows,t,fx.h,state.cfg),pa=E.profile(rows,t,fx.a,state.cfg);if(!ph||!pa)return '';
  const mu=A.F.mu,lg={g1:(mu.H.g1+mu.A.g1)/2,g2:(mu.H.g2+mu.A.g2)/2,c:(mu.H.c+mu.A.c)/2,y:(mu.H.y+mu.A.y)/2};
  const row=(l,a,b,c)=>`<tr><td>${l}</td><td class="v">${a}</td><td class="v">${b}</td><td class="v muted">${c}</td></tr>`;
  const seq=(p,team,f)=>p.last.map(r=>f(r,r.h===team)).join(' · ');
  const tot={c:r=>r.hc+r.ac,y:r=>r.hy+r.ay,g:r=>r.hg2+r.ag2};
  const T=(team,m)=>A.F.teams[team]?A.F.teams[team]:null,idx=(team,m,k)=>{const x=T(team);return x?'×'+fr(x[k][m],2):'—'};
  return `<div class="card profile"><p class="eyebrow">Profils des équipes (moyennes pondérées par match)</p><div class="tbl-wrap" style="border:none"><table>
    <thead><tr><th>Indicateur</th><th class="r">${esc(fx.h)}</th><th class="r">${esc(fx.a)}</th><th class="r">Ligue</th></tr></thead><tbody>
    ${row('Buts marqués en 1ʳᵉ MT',fr(ph.g1,2),fr(pa.g1,2),fr(lg.g1,2))}
    ${row('Buts marqués en 2ᵉ MT',fr(ph.g2,2),fr(pa.g2,2),fr(lg.g2,2))}
    ${row('Buts encaissés en 2ᵉ MT',fr(ph.g2c,2),fr(pa.g2c,2),fr(lg.g2,2))}
    ${row('Part des buts marqués après la pause',pct(ph.share),pct(pa.share),pct(lg.g2/(lg.g1+lg.g2)))}
    ${row('Corners obtenus',fr(ph.cf),fr(pa.cf),fr(lg.c))}
    ${row('Corners concédés',fr(ph.ca),fr(pa.ca),fr(lg.c))}
    ${row('Cartons reçus',fr(ph.yf),fr(pa.yf),fr(lg.y))}
    ${row('Cartons provoqués chez l’adversaire',fr(ph.ya),fr(pa.ya),fr(lg.y))}
    ${row('Note attaque corners (1 = ligue)',idx(fx.h,'c','att'),idx(fx.a,'c','att'),'×1')}
    ${row('Note discipline (cartons reçus)',idx(fx.h,'y','att'),idx(fx.a,'y','att'),'×1')}
    ${row('Corners totaux, 6 derniers matchs',`<span class="form-seq">${seq(ph,fx.h,tot.c)}</span>`,`<span class="form-seq">${seq(pa,fx.a,tot.c)}</span>`,'')}
    ${row('Cartons totaux, 6 derniers matchs',`<span class="form-seq">${seq(ph,fx.h,tot.y)}</span>`,`<span class="form-seq">${seq(pa,fx.a,tot.y)}</span>`,'')}
    ${row('Buts en 2ᵉ MT, 6 derniers matchs',`<span class="form-seq">${seq(ph,fx.h,tot.g)}</span>`,`<span class="form-seq">${seq(pa,fx.a,tot.g)}</span>`,'')}
    </tbody></table></div></div>`;
}

/* ---------- Sélections ---------- */
const pickId=(fx,k)=>fx.id+'|'+k;
function allPicks(){
  const thr=state.thr/100,out=[],sel=state.sel,t0=E.parseDate(today());
  state.fx.forEach(fx=>{
    if(sel.div&&fx.div!==sel.div)return;
    if(sel.period!=='all'){const t=E.parseDate(fx.date);if(!(t>=t0&&t<=t0+(+sel.period)*864e5))return}
    const A=analyzeFx(fx);if(!A)return;const probs=E.KEYS.map(k=>A.M.byKey[k].p),nmin=Math.min(A.P.nh,A.P.na);
    E.selectPicks(probs,thr).forEach(j=>{const o=A.M.byKey[E.KEYS[j]];if(sel.m&&o.m!==sel.m)return;const rel=reliability(o.k,o.p),conf=confidence(o.p,rel,nmin);
      if(sel.conf==='h'&&conf!=='h')return;if(sel.conf==='m'&&conf==='f')return;out.push({fx,o,rel,conf,id:pickId(fx,o.k)})})});
  const ord={h:0,m:1,f:2};out.sort((a,b)=>ord[a.conf]-ord[b.conf]||b.o.p-a.o.p);return out;
}
function findPick(id){
  const fxId=id.slice(0,id.indexOf('|')),k=id.slice(id.indexOf('|')+1),fx=state.fx.find(f=>f.id===fxId);if(!fx)return null;
  const A=analyzeFx(fx);if(!A||!A.M.byKey[k])return null;return {fx,o:A.M.byKey[k]}}
function leg(fx,o){return {div:fx.div,h:fx.h,a:fx.a,date:fx.date,k:o.k,label:o.label,p:o.p,m:o.m}}
function renderFilters(){
  const divs=[...new Set(state.fx.map(f=>f.div))];
  $('f-div').innerHTML='<option value="">Tous</option>'+divs.map(d=>`<option value="${esc(d)}">${esc(divName(d))}</option>`).join('');
  $('f-period').value=state.sel.period;$('f-div').value=divs.includes(state.sel.div)?state.sel.div:'';$('f-mkt').value=state.sel.m;$('f-conf').value=state.sel.conf;
}
function renderCombo(){
  state.combo=state.combo.filter(id=>findPick(id));const legs=state.combo.map(findPick);const el=$('combo');
  if(!legs.length){el.innerHTML='';return}
  const p=legs.reduce((a,l)=>a*l.o.p,1),same=new Set(legs.map(l=>l.fx.id)).size<legs.length;
  const c=parseFloat(String(state.comboOdd||'').replace(',','.'));let v='';
  if(c>1){const e=p*c-1;v=e>.03?`<b class="pos">Value +${fr(e*100)} %</b>`:e>-.03?'<b>Prix juste</b>':`<b class="neg">Pas de value (${fr(e*100)} %)</b>`}
  el.innerHTML=`<div class="card combo"><div><div class="eyebrow" style="margin:0">Combiné · ${legs.length} sélection${legs.length>1?'s':''}</div><span class="big">${pct(p)}</span> <span class="muted num">cote juste ${odd(p)}</span></div>
    <div class="fld"><label for="combo-odd">Cote proposée</label><input id="combo-odd" type="number" inputmode="decimal" step="0.01" min="1.01" value="${esc(state.comboOdd||'')}"></div>
    <div class="sub" style="max-width:340px">${v}${same?`${v?' · ':''}<span class="neg">Deux sélections viennent du même match : elles ne sont pas indépendantes, la probabilité réelle diffère.</span>`:''}</div>
    <div style="display:flex;gap:8px"><button type="button" class="primary small" id="combo-track">Suivre ce combiné</button><button type="button" class="small" id="combo-clear">Vider</button></div></div>`;
  $('combo-odd').oninput=e=>{state.comboOdd=e.target.value;save();const keep=e.target.selectionStart;renderCombo();const n=$('combo-odd');n.focus();try{n.setSelectionRange(keep,keep)}catch(x){}};
  $('combo-clear').onclick=()=>{state.combo=[];state.comboOdd='';save();renderPicks()};
  $('combo-track').onclick=()=>{addTrack(legs.map(l=>leg(l.fx,l.o)),state.comboOdd);state.combo=[];state.comboOdd='';save();renderPicks();toast('Combiné ajouté au suivi')};
}
function renderPicks(){
  renderFilters();renderCombo();
  const out=allPicks(),el=$('picks');
  if(!out.length){el.innerHTML=`<div class="empty">Aucune sélection avec ces filtres au-dessus de ${state.thr} %. Élargissez la période, baissez le seuil ou ajoutez des rencontres.</div>`;return}
  const tracked=new Set(state.track.filter(t=>t.legs.length===1).map(t=>t.legs[0].date+t.legs[0].h+t.legs[0].a+t.legs[0].k));
  el.innerHTML=`<table><thead><tr><th aria-label="Combiné"></th><th>Rencontre</th><th>Marché</th><th>Sélection</th><th>Probabilité · cote juste</th><th>Réussite historique</th><th>Confiance</th><th></th></tr></thead><tbody>${
    out.slice(0,80).map(({fx,o,rel,conf,id})=>{const tk=tracked.has(fx.date+fx.h+fx.a+o.k);return `<tr><td><input type="checkbox" class="pick-cb" data-combo="${esc(id)}" aria-label="Ajouter au combiné"${state.combo.includes(id)?' checked':''}></td>
     <td><button type="button" class="link" data-fx="${fx.id}" data-go="analyse">${esc(fx.h)} – ${esc(fx.a)}</button><div class="sub">${esc(divName(fx.div))} · ${esc(fx.date)}${fx.time?' · '+esc(fx.time):''}</div></td>
     <td><span class="mkt-tag"><span class="dot" style="background:${MK[o.m].color}"></span>${MK[o.m].t}</span></td><td>${esc(o.label)}</td>
     <td style="min-width:140px">${pcell(o.p,true)}</td><td class="num">${rel&&rel.n>=5?`${pct(rel.r)} <span class="muted">(${rel.n})</span>`:'—'}</td><td>${chip(conf)}</td>
     <td><button type="button" class="small" data-track="${esc(id)}"${tk?' disabled':''}>${tk?'Suivi':'Suivre'}</button></td></tr>`}).join('')}</tbody></table>`;
}

/* ---------- Suivi des paris ---------- */
function addTrack(legs,o){state.track.unshift({id:'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),at:Date.now(),legs,p:legs.reduce((a,l)=>a*l.p,1),odd:o||'',res:null});save();settle()}
function settle(){
  let changed=false;
  state.track.forEach(t=>{if(t.res!=null)return;let all=true,lost=false;
    t.legs.forEach(l=>{if(l.res==null){const ts=E.parseDate(l.date),row=(DATA[l.div]||[]).find(r=>r.h===l.h&&r.a===l.a&&Math.abs(r.t-ts)<=864e5);
      if(row){l.res=E.outcome(l.k,row);l.score=`${row.hg1+row.hg2}-${row.ag1+row.ag2} · ${row.hc+row.ac} corners · ${row.hy+row.ay} cartons · 2ᵉ MT ${row.hg2}-${row.ag2}`;changed=true}}
      if(l.res==null)all=false;else if(l.res===0)lost=true});
    if(lost){t.res=0;changed=true}else if(all){t.res=1;changed=true}});
  if(changed)save();
}
function renderTrack(){
  const el=$('suivi'),T=state.track;
  if(!T.length){el.innerHTML='<div class="card empty">Aucun pari suivi. Dans « Sélections fortes », touchez « Suivre » sur une sélection ou cochez plusieurs lignes pour suivre un combiné.</div>';return}
  const done=T.filter(t=>t.res!=null),wins=done.filter(t=>t.res===1).length,withOdd=done.filter(t=>parseFloat(t.odd)>1);
  const profit=withOdd.reduce((a,t)=>a+(t.res?parseFloat(String(t.odd).replace(',','.'))-1:-1),0),mp=done.length?done.reduce((a,t)=>a+t.p,0)/done.length:null;
  const st=t=>t.res==null?'<span class="st st-p">En attente</span>':t.res?'<span class="st st-w">Gagné</span>':'<span class="st st-l">Perdu</span>';
  el.innerHTML=`<div class="tiles">
    <div class="card tile"><h3>Paris réglés</h3><span class="big">${done.length} / ${T.length}</span></div>
    <div class="card tile"><h3>Réussite réelle</h3><span class="big ${mp==null?'':wins/done.length>=mp-.02?'pos':'neg'}">${done.length?pct(wins/done.length):'—'}</span><div class="row"><span>Probabilité annoncée</span><b>${pct(mp)}</b></div></div>
    <div class="card tile"><h3>Bénéfice</h3><span class="big ${!withOdd.length?'':profit>=0?'pos':'neg'}">${withOdd.length?(profit>=0?'+':'')+fr(profit,2)+' u':'—'}</span><div class="row"><span>ROI sur ${withOdd.length} pari${withOdd.length>1?'s':''} avec cote</span><b>${withOdd.length?(profit>=0?'+':'')+fr(profit/withOdd.length*100)+' %':'—'}</b></div></div>
  </div>
  <div class="card tbl-wrap"><table><thead><tr><th>Pari</th><th>Probabilité</th><th>Cote jouée</th><th>Statut</th><th></th></tr></thead><tbody>${T.map(t=>`<tr>
    <td>${t.legs.map(l=>`<div><b>${esc(l.h)} – ${esc(l.a)}</b> <span class="sub">${esc(l.date)}</span><br>${esc(l.label)} ${l.res==null?'':l.res?'<span class="pos">✓</span>':'<span class="neg">✗</span>'}${l.score?`<div class="sub">${esc(l.score)}</div>`:''}</div>`).join('<div style="height:6px"></div>')}</td>
    <td class="num">${pct(t.p)}<div class="sub">juste ${odd(t.p)}</div></td>
    <td><input type="number" inputmode="decimal" step="0.01" min="1.01" style="width:90px" data-todd="${t.id}" value="${esc(t.odd)}" aria-label="Cote jouée"></td>
    <td>${st(t)}</td><td><button type="button" class="small danger" data-tdel="${t.id}">Retirer</button></td></tr>`).join('')}</tbody></table></div>
  <p class="sub" style="margin-top:10px">Bénéfice calculé pour une mise de 1 unité par pari, uniquement sur les paris dont la cote est renseignée.</p>`;
  el.querySelectorAll('[data-todd]').forEach(i=>i.onchange=()=>{const t=state.track.find(x=>x.id===i.dataset.todd);if(t){t.odd=i.value;save();renderTrack()}});
}
function toast(msg){let t=$('toast');if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','status');t.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:8px;font-weight:600;z-index:20';document.body.appendChild(t)}
  t.textContent=msg;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>{t.hidden=true},2200)}

/* ---------- Validation ---------- */
function renderValidation(){
  const el=$('validation');
  if(!BT||BT.status!=='done'){el.innerHTML=`<div class="card empty">Validation en cours sur l’historique (${Math.round((BT?BT.prog:0)*100)} %)…</div>`;return}
  const N=BT.P.length;if(N<30){el.innerHTML='<div class="card empty">Pas assez de matchs pour valider le modèle. Importez au moins une saison complète.</div>';return}
  const thr=state.thr/100,stat=j=>{let b=0,f=0,mp=0;for(let i=0;i<N;i++){const p=BT.P[i][j],o=BT.O[i][j];b+=(p-o)*(p-o);f+=o;mp+=p}f/=N;b/=N;const base=f*(1-f);return {f,mp:mp/N,b,bss:base>0?1-b/base:0}};
  const groups={y:[],c:[],g2:[]};E.KMETA.forEach((k,j)=>{if(k.side!=='u')groups[k.m].push(j)});
  const picks={y:{n:0,h:0,p:0},c:{n:0,h:0,p:0},g2:{n:0,h:0,p:0}};
  for(let i=0;i<N;i++)E.selectPicks(BT.P[i],thr).forEach(j=>{const g=picks[E.KMETA[j].m];g.n++;g.h+=BT.O[i][j];g.p+=BT.P[i][j]});
  const tiles=['y','c','g2'].map(m=>{const s=groups[m].map(stat),bss=s.reduce((a,x)=>a+x.bss,0)/s.length,pk=picks[m];
    const hr=pk.n?pk.h/pk.n:null,mp=pk.n?pk.p/pk.n:null;
    return `<div class="card tile"><h3>${MK[m].t}</h3>
      <div class="row"><span>Sélections ≥ ${state.thr} %</span><b>${pk.n.toLocaleString('fr-FR')}</b></div>
      <div class="row"><span>Réussite réelle</span><b class="${hr!=null&&hr>=mp-.02?'pos':'neg'}">${pct(hr)}</b></div>
      <div class="row"><span>Probabilité annoncée</span><b>${pct(mp)}</b></div>
      <div class="row"><span>Gain de précision vs moyenne (Brier)</span><b class="${bss>0?'pos':'neg'}">${bss>0?'+':''}${fr(bss*100)} %</b></div></div>`}).join('');
  const table=['y','c','g2'].map(m=>groups[m].map(j=>{const s=stat(j),k=E.KMETA[j],lab=k.extra?markLabel(k.k):`Plus de ${fr(k.line)} ${{y:'cartons',c:'corners',g2:'buts 2ᵉ MT'}[m]}`;
    return `<tr><td><span class="mkt-tag"><span class="dot" style="background:${MK[m].color}"></span>${MK[m].t}</span></td><td>${lab}</td><td class="num">${pct(s.mp)}</td><td class="num">${pct(s.f)}</td><td class="num">${fr(s.b,3)}</td><td class="num ${s.bss>0?'pos':'neg'}">${s.bss>0?'+':''}${fr(s.bss*100)} %</td></tr>`}).join('')).join('');
  el.innerHTML=`<div class="tiles">${tiles}</div>
    <div class="calib-wrap"><div class="card calib"><div class="bar-head" style="margin-bottom:6px"><p class="eyebrow" style="margin:0">Calibration : probabilité annoncée contre fréquence réelle</p>
      <div class="seg">${['y','c','g2'].map(m=>`<button type="button" data-cal="${m}" aria-pressed="${state.calib===m}">${MK[m].t}</button>`).join('')}</div></div>${calibSvg(state.calib,groups[state.calib])}</div>
      <div class="card prose" style="padding:16px"><p class="eyebrow">Lire ces résultats</p>
      <p><b>Calibration.</b> Si le modèle est bien réglé, les points suivent la diagonale : parmi les paris annoncés à 70 %, environ 70 % passent. Un point sous la diagonale signale un excès d’optimisme dans cette zone.</p>
      <p><b>Réussite réelle.</b> C’est le pourcentage de sélections gagnantes quand le modèle dépasse le seuil choisi. Comparez-le à la probabilité annoncée : un écart de plus de 3 points doit rendre prudent.</p>
      <p><b>Gain de précision.</b> Le score de Brier compare le modèle à une prédiction naïve (la fréquence moyenne de la ligue). Un gain positif signifie que les notes d’équipes apportent une information réelle. Les totaux de corners et de cartons sont très aléatoires : un gain de 3 à 8 % est déjà solide.</p>
      <p><b>Base :</b> ${N.toLocaleString('fr-FR')} matchs prédits, chacun avec les seules données antérieures${state.demo?'. La démo étant simulée, ses résultats illustrent la méthode sans valeur réelle':''}.</p></div></div>
    <div class="card tbl-wrap" style="margin-top:18px"><table><thead><tr><th>Marché</th><th>Pari</th><th>Proba moyenne</th><th>Fréquence réelle</th><th>Brier</th><th>Gain vs moyenne</th></tr></thead><tbody>${table}</tbody></table></div>`;
}
function markLabel(k){return {'g2|more':'2ᵉ MT plus prolifique','g2|notless':'2ᵉ MT au moins aussi prolifique','g2|btts':'Les deux marquent en 2ᵉ MT','g2|h':'Domicile marque en 2ᵉ MT','g2|a':'Extérieur marque en 2ᵉ MT','c|h':'Domicile a plus de corners','c|a':'Extérieur a plus de corners','c|h45':'Domicile plus de 4,5 corners','c|a45':'Extérieur plus de 4,5 corners','y|h15':'Domicile plus de 1,5 carton','y|a15':'Extérieur plus de 1,5 carton'}[k]||k}
function calibSvg(m,idx){
  const bins=Array.from({length:10},()=>({n:0,p:0,o:0}));
  BT.P.forEach((row,i)=>idx.forEach(j=>{const p=row[j],b=bins[Math.min(9,Math.floor(p*10))];b.n++;b.p+=p;b.o+=BT.O[i][j]}));
  const S=300,L=36,B=26,W=S+L+10,H=S+B+10,x=v=>L+v*S,y=v=>10+S-v*S,mxn=Math.max(...bins.map(b=>b.n),1);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagramme de calibration">`;
  for(let v=0;v<=1.001;v+=.2){s+=`<line x1="${x(0)}" x2="${x(1)}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><line y1="${y(0)}" y2="${y(1)}" x1="${x(v)}" x2="${x(v)}" stroke="var(--line)"/>`;
    s+=`<text x="${L-6}" y="${y(v)+3}" text-anchor="end">${Math.round(v*100)}</text><text x="${x(v)}" y="${y(0)+16}" text-anchor="middle">${Math.round(v*100)}</text>`}
  s+=`<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  const pts=bins.filter(b=>b.n>=8).map(b=>[b.p/b.n,b.o/b.n,b.n]);
  if(pts.length>1)s+=`<polyline fill="none" stroke="${MK[m].color}" stroke-width="2" points="${pts.map(p=>x(p[0]).toFixed(1)+','+y(p[1]).toFixed(1)).join(' ')}"/>`;
  pts.forEach(p=>{s+=`<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="${(3+6*Math.sqrt(p[2]/mxn)).toFixed(1)}" fill="${MK[m].color}" fill-opacity=".8" stroke="var(--surface)"><title>Annoncé ${pct(p[0])} · réel ${pct(p[1])} · ${p[2]} cas</title></circle>`});
  return s+`<text x="${x(.5)}" y="${H-1}" text-anchor="middle">probabilité annoncée (%)</text></svg>`;
}

/* ---------- Données ---------- */
const CATALOG=[
  ['Angleterre',[['E0','Premier League'],['E1','Championship'],['E2','League One'],['E3','League Two'],['EC','National League']]],
  ['France',[['F1','Ligue 1'],['F2','Ligue 2']]],
  ['Espagne',[['SP1','LaLiga'],['SP2','LaLiga 2']]],
  ['Italie',[['I1','Serie A'],['I2','Serie B']]],
  ['Allemagne',[['D1','Bundesliga'],['D2','2. Bundesliga']]],
  ['Pays-Bas',[['N1','Eredivisie']]],['Belgique',[['B1','Pro League']]],['Portugal',[['P1','Liga Portugal']]],
  ['Turquie',[['T1','Süper Lig']]],['Grèce',[['G1','Super League']]],
  ['Écosse',[['SC0','Premiership'],['SC1','Championship'],['SC2','League One'],['SC3','League Two']]]
];
function seasons(){const d=new Date(),y=d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1;return [0,1,2].map(i=>{const a=y-i;return {code:String(a%100).padStart(2,'0')+String((a+1)%100).padStart(2,'0'),label:a+'-'+String((a+1)%100).padStart(2,'0'),start:Date.UTC(a,6,1),end:Date.UTC(a+1,6,1)}})}
function renderCatalog(){
  const S=seasons();
  const have=(div,s)=>(DATA[div]||[]).some(r=>r.t>=s.start&&r.t<s.end);
  $('catalog').innerHTML=`<table class="cat"><tbody>${CATALOG.map(([c,ls])=>`<tr><td colspan="2" class="cty">${c}</td></tr>`+ls.map(([code,n])=>
    `<tr><td>${n} <span class="muted num">${code}</span></td><td><div class="sz">${S.map(s=>{const h=have(code,s);
      return `<a class="dl${h?' have':''}" href="https://www.football-data.co.uk/mmz4281/${s.code}/${code}.csv" target="_blank" rel="noopener" title="${h?'Déjà importée':'Télécharger la saison '+s.label}">${h?'✓ ':''}${s.label}</a>`}).join('')}</div></td></tr>`).join('')).join('')}</tbody></table>`;
}
/* ---------- Mise à jour automatique (application Android) ---------- */
const pend={};let nid=0,updating=false,autoMsg='';
window.__mlNative=(id,ok,txt)=>{const p=pend[id];if(!p)return;delete pend[id];ok?p.res(txt):p.rej(new Error(txt))};
function nfetch(url){return new Promise((res,rej)=>{const id='r'+(++nid);pend[id]={res,rej};
  setTimeout(()=>{if(pend[id]){delete pend[id];rej(new Error('Délai dépassé'))}},60000);
  try{NATIVE.fetch(id,url)}catch(e){delete pend[id];rej(e)}})}
function setAutoMsg(t){autoMsg=t;const el=$('auto-msg');if(el)el.textContent=t}
function loadFixtures(txt){
  const t0=E.parseDate(today()),list=E.parseFixtures(txt).filter(f=>state.auto.divs.includes(f.div)&&f.t>=t0).map(f=>{const date=new Date(f.t).toISOString().slice(0,10);
    return {id:'up-'+f.div+'-'+date+'-'+f.h+'-'+f.a,div:f.div,h:f.h,a:f.a,ref:f.ref,ctx:'normal',date,time:f.time,md:f.md,mo:f.mo,auto:1}});
  list.sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time));
  state.fx=list.concat(state.fx.filter(f=>!f.auto));
  if(list.length&&!state.fx.find(f=>f.id===state.cur))state.cur=list[0].id;
  return list.length;
}
async function autoUpdate(){
  if(updating||!NATIVE)return;if(!state.auto.divs.length){setAutoMsg('Cochez au moins un championnat.');return}
  updating=true;renderAuto();
  const S=seasons(),tasks=[];state.auto.divs.forEach(d=>S.forEach(s=>tasks.push([d,s])));
  let done=0,ok=0;const fail=[];setAutoMsg(`Téléchargement 0 / ${tasks.length}…`);
  const run=async([d,s])=>{try{const txt=await nfetch(`https://www.football-data.co.uk/mmz4281/${s.code}/${d}.csv`);const r=E.parseCSV(txt,d);
      if(!r.error&&r.rows.length){const id='auto-'+d+'-'+s.code;state.ds=state.ds.filter(x=>x.id!==id);state.ds.push({id,name:`${divName(d)} ${s.label}`,auto:1,rows:r.rows.map(pack)});ok++}
      else fail.push(`${d} ${s.label}`)}catch(e){fail.push(`${d} ${s.label}`)}
    done++;setAutoMsg(`Téléchargement ${done} / ${tasks.length}…`)};
  const q=tasks.slice();await Promise.all([0,1,2,3].map(async()=>{while(q.length)await run(q.shift())}));
  state.ds=state.ds.filter(x=>!x.auto||state.auto.divs.includes(x.id.split('-')[1]));
  let nf=0;try{nf=loadFixtures(await nfetch('https://www.football-data.co.uk/fixtures.csv'))}catch(e){}
  if(ok&&state.demo){state.demo=false;state.fx=state.fx.filter(f=>f.div!=='DEMO')}
  if(ok)state.auto.last=Date.now();save();updating=false;
  setAutoMsg(ok?`${ok} saisons à jour · ${nf} matchs à venir chargés${fail.length?` · non disponibles : ${fail.length>6?fail.length+' fichiers (saison pas encore publiée ou championnat sans statistiques)':fail.join(', ')}`:''}${saveFailed?' · base trop lourde pour rester en mémoire : elle sera retéléchargée au prochain lancement':''}`
    :'Aucune donnée reçue. Vérifiez votre connexion Internet puis réessayez.');
  rebuild();fillBuilder();renderView();
}
function renderAuto(){
  const el=$('auto');if(!el)return;
  if(!NATIVE){el.innerHTML=`<p class="eyebrow">Mise à jour automatique</p><p class="sub" style="margin:0">Disponible dans l’application Android Matchlab : elle télécharge elle-même les championnats choisis et les matchs à venir, à chaque ouverture.</p>`;return}
  const all=CATALOG.flatMap(([c,ls])=>ls);
  el.innerHTML=`<p class="eyebrow">Mise à jour automatique</p>
    <div class="auto-grid">${all.map(([code,n])=>`<label class="check"><input type="checkbox" data-auto="${code}"${state.auto.divs.includes(code)?' checked':''}> ${n} <span class="muted num">${code}</span></label>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="primary" type="button" id="auto-go"${updating?' disabled':''}>${updating?'Mise à jour en cours…':'Mettre à jour maintenant'}</button>
    <button type="button" id="auto-all">Tout cocher</button><button type="button" id="auto-none">Tout décocher</button></div>
    <div class="sub" id="auto-msg" style="margin-top:8px">${esc(autoMsg||(state.auto.last?'Dernière mise à jour : '+new Date(state.auto.last).toLocaleString('fr-FR'):'Jamais mis à jour'))}</div>
    <div class="sub" style="margin-top:4px">3 saisons par championnat + calendrier des matchs à venir. Mise à jour automatique à l’ouverture si les données ont plus de 6 heures.</div>`;
  $('auto-go').onclick=autoUpdate;
  $('auto-all').onclick=()=>{state.auto.divs=all.map(x=>x[0]);save();renderAuto()};
  $('auto-none').onclick=()=>{state.auto.divs=[];save();renderAuto()};
  el.querySelectorAll('[data-auto]').forEach(cb=>cb.onchange=()=>{const c=cb.dataset.auto;state.auto.divs=cb.checked?[...new Set(state.auto.divs.concat(c))]:state.auto.divs.filter(x=>x!==c);save()});
}
function renderData(){
  renderAuto();
  renderCatalog();
  const items=[];
  if(state.demo)items.push(`<li><div><b>Ligue simulée (démo)</b><div class="sub">380 matchs fictifs générés pour tester l’application</div></div><button type="button" data-demo="off">Retirer</button></li>`);
  state.ds.forEach(d=>{const t=d.rows.map(r=>r[1]),divs=[...new Set(d.rows.map(r=>r[0]))];
    items.push(`<li><div><b>${esc(d.name)}</b><div class="sub">${divs.map(x=>esc(divName(x))).join(', ')} · ${d.rows.length} matchs · ${dstr(Math.min(...t))} → ${dstr(Math.max(...t))}</div></div><button type="button" class="danger" data-rm="${d.id}">Supprimer</button></li>`)});
  if(!state.demo)items.push(`<li><div class="sub">La démo est désactivée.</div><button type="button" data-demo="on">Réactiver la démo</button></li>`);
  $('ds-list').innerHTML=items.join('');
  $('s-mkt').value=state.cfg.mkt?'1':'0';$('s-hl').value=state.cfg.hl;$('s-k').value=state.cfg.k;$('s-kr').value=state.cfg.kr;$('s-n').value=state.cfg.N;
}
function importText(text,name,fallback){
  const res=E.parseCSV(text,fallback);
  if(res.error)return {ok:false,msg:`${name} : ${res.error}`};
  state.ds.push({id:'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name,rows:res.rows.map(pack)});
  return {ok:true,msg:`${name} : ${res.rows.length} matchs importés${res.skipped?`, ${res.skipped} lignes incomplètes ignorées`:''}.`};
}
async function importFiles(files){
  const msgs=[];let any=false;
  for(const f of files){const text=await f.text().catch(()=>null);if(text==null){msgs.push({ok:false,msg:f.name+' : lecture impossible.'});continue}
    const code=(f.name.match(/^([A-Z]{1,3}\d?)/)||[])[1];const r=importText(text,f.name,code);msgs.push(r);any=any||r.ok}
  afterImport(any,msgs);
}
function afterImport(any,msgs){
  if(any&&state.demo){state.demo=false;state.fx=state.fx.filter(f=>f.div!=='DEMO');msgs.push({ok:true,msg:'La démo simulée a été retirée pour ne garder que vos données.'})}
  save();if(saveFailed)msgs.push({ok:false,msg:'La base est trop volumineuse pour être gardée dans ce navigateur : elle reste active jusqu’à la fermeture de la page.'});
  $('imp-msg').innerHTML=msgs.map(m=>`<div class="msg ${m.ok?'ok':'err'}">${esc(m.msg)}</div>`).join('');
  if(any){rebuild();fillBuilder()}renderView();
}

/* ---------- Navigation ---------- */
const VIEWS=['analyse','selections','validation','suivi','donnees'];
function renderView(){
  const v=VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):'analyse';
  VIEWS.forEach(x=>{$('v-'+x).hidden=x!==v});document.querySelectorAll('.tabs a').forEach(a=>a.setAttribute('aria-current',a.dataset.v===v?'page':'false'));
  renderStatus();
  if(v==='analyse'){renderFxList();renderAnalysis()}
  if(v==='selections'){$('thr').value=state.thr;$('thr-out').textContent=state.thr+' %';renderPicks()}
  if(v==='validation')renderValidation();
  if(v==='suivi')renderTrack();
  if(v==='donnees')renderData();
}
window.addEventListener('hashchange',renderView);

document.addEventListener('click',e=>{
  const fxb=e.target.closest('[data-fx]');if(fxb){state.cur=fxb.dataset.fx;save();if(fxb.dataset.go&&location.hash!=='#analyse')location.hash='analyse';else renderView();window.scrollTo({top:0,behavior:'smooth'});return}
  const cal=e.target.closest('[data-cal]');if(cal){state.calib=cal.dataset.cal;save();renderValidation();return}
  const rm=e.target.closest('[data-rm]');if(rm){if(!rm.classList.contains('armed')){rm.classList.add('armed');rm.textContent='Confirmer';setTimeout(()=>{rm.classList.remove('armed');rm.textContent='Supprimer'},4000);return}
    state.ds=state.ds.filter(d=>d.id!==rm.dataset.rm);if(!state.ds.length)state.demo=true;save();rebuild();fillBuilder();renderView();return}
  const tr=e.target.closest('[data-track]');if(tr){const f=findPick(tr.dataset.track);if(f){addTrack([leg(f.fx,f.o)],'');renderPicks();toast('Ajouté au suivi')}return}
  const td=e.target.closest('[data-tdel]');if(td){if(!td.classList.contains('armed')){td.classList.add('armed');td.textContent='Confirmer';setTimeout(()=>{td.classList.remove('armed');td.textContent='Retirer'},4000);return}
    state.track=state.track.filter(t=>t.id!==td.dataset.tdel);save();renderTrack();return}
  const dm=e.target.closest('[data-demo]');if(dm){state.demo=dm.dataset.demo==='on';if(!state.demo)state.fx=state.fx.filter(f=>f.div!=='DEMO');save();rebuild();fillBuilder();renderView()}
});
document.addEventListener('change',e=>{const cb=e.target.closest('[data-combo]');if(!cb)return;const id=cb.dataset.combo;
  state.combo=cb.checked?[...new Set(state.combo.concat(id))]:state.combo.filter(x=>x!==id);save();renderCombo()});
[['f-period','period'],['f-div','div'],['f-mkt','m'],['f-conf','conf']].forEach(([id,k])=>$(id).addEventListener('change',()=>{state.sel[k]=$(id).value;save();renderPicks()}));
$('b-div').addEventListener('change',fillTeams);
$('b-add').addEventListener('click',()=>{
  const fx={id:'f'+Date.now().toString(36),div:$('b-div').value,h:$('b-h').value,a:$('b-a').value,ref:$('b-ref').value,ctx:$('b-ctx').value,date:$('b-date').value||today()};
  {const n=id=>parseFloat(String($(id).value).replace(',','.'));Object.assign(fx,E.marketFeat(n('b-o1'),n('b-oN'),n('b-o2'),n('b-oo'),n('b-ou')))}
  if(!fx.div||!fx.h||!fx.a){$('b-msg').textContent='Importez d’abord des données.';return}
  if(fx.h===fx.a){$('b-msg').textContent='Choisissez deux équipes différentes.';return}
  $('b-msg').textContent='';state.fx.unshift(fx);state.cur=fx.id;save();renderView();
});
$('thr').addEventListener('input',()=>{state.thr=+$('thr').value;$('thr-out').textContent=state.thr+' %';save();renderPicks()});
['s-mkt','s-hl','s-k','s-kr','s-n'].forEach(id=>$(id).addEventListener('change',()=>{state.cfg={mkt:$('s-mkt').value==='1',hl:+$('s-hl').value,k:+$('s-k').value,kr:+$('s-kr').value,N:+$('s-n').value};save();rebuild();fillBuilder();renderView()}));
$('file').addEventListener('change',e=>{if(e.target.files.length)importFiles([...e.target.files]);e.target.value=''});
const drop=$('drop');
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const f=[...(e.dataTransfer.files||[])];if(f.length)importFiles(f)});
$('paste-go').addEventListener('click',()=>{const t=$('paste').value;if(!t.trim())return;const code=$('paste-div').value.trim().toUpperCase()||'LIGUE';const r=importText(t,'Collage '+code,code);if(r.ok)$('paste').value='';afterImport(r.ok,[r])});

rebuild();fillBuilder();renderView();
if(NATIVE&&state.auto.divs.length&&(Date.now()-state.auto.last>6*3600e3||!state.ds.some(d=>d.auto)))setTimeout(()=>{if(location.hash!=='#donnees')setAutoMsg('');autoUpdate()},400);
})();
