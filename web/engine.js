window.ML=(function(){
'use strict';
const MET=['g1','g2','c','y'];
const DIVN={E0:'Premier League',E1:'Championship',E2:'League One',E3:'League Two',EC:'National League',F1:'Ligue 1',F2:'Ligue 2',SP1:'LaLiga',SP2:'LaLiga 2',I1:'Serie A',I2:'Serie B',D1:'Bundesliga',D2:'2. Bundesliga',N1:'Eredivisie',P1:'Liga Portugal',B1:'Pro League (Belgique)',T1:'Süper Lig',G1:'Super League (Grèce)',SC0:'Premiership (Écosse)',SC1:'Championship (Écosse)',SC2:'League One (Écosse)',SC3:'League Two (Écosse)',DEMO:'Ligue simulée (démo)'};

function fr(x,d){return Number(x).toLocaleString('fr-FR',{maximumFractionDigits:d==null?1:d})}

/* ---------- Aléatoire reproductible ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function makeRng(seed){
  const u=mulberry32(seed);let spare=null;
  const norm=()=>{if(spare!==null){const s=spare;spare=null;return s}let x,y,r;do{x=u()*2-1;y=u()*2-1;r=x*x+y*y}while(r>=1||r===0);const f=Math.sqrt(-2*Math.log(r)/r);spare=y*f;return x*f};
  const gamma=k=>{if(k<1)return gamma(k+1)*Math.pow(u(),1/k);const d=k-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=norm();v=1+c*x}while(v<=0);v=v*v*v;const U=u();if(U<1-0.0331*x*x*x*x)return d*v;if(Math.log(U)<0.5*x*x+d*(1-v+Math.log(v)))return d*v}};
  const pois=l=>{if(!(l>0))return 0;if(l>30)return Math.max(0,Math.round(l+Math.sqrt(l)*norm()));const L=Math.exp(-l);let k=0,p=1;do{k++;p*=u()}while(p>L);return k-1};
  return {u,norm,gamma,pois};
}

/* ---------- Lois de probabilité ---------- */
function poisArr(l,kmax){l=Math.max(l,1e-6);const a=[];let p=Math.exp(-l);for(let k=0;k<=kmax;k++){a.push(p);p=p*l/(k+1)}return a}
function nbmv(m,v,kmax){m=Math.max(m,1e-6);if(!(v>m*1.0005))return poisArr(m,kmax);const r=m*m/(v-m),q=m/(r+m),a=[];let p=Math.exp(r*Math.log(r/(r+m)));for(let k=0;k<=kmax;k++){a.push(p);p=p*(k+r)/(k+1)*q}return a}
function over(d,L){let c=0;for(let k=0;k<=Math.floor(L)&&k<d.length;k++)c+=d[k];return Math.min(1,Math.max(0,1-c))}
function cmp(d1,d2){let gt=0,eq=0;for(let i=0;i<d1.length;i++)for(let j=0;j<d2.length;j++){const p=d1[i]*d2[j];if(i>j)gt+=p;else if(i===j)eq+=p}return {gt,eq,lt:Math.max(0,1-gt-eq)}}

/* ---------- Cotes du marché -> probabilités implicites (marge retirée) ---------- */
function oddsIndex(head){const f=(...ns)=>{for(const n of ns){const i=head.indexOf(n);if(i>=0)return i}return -1};
  return {h:f('AvgH','B365H','PSH','BbAvH','WHH'),d:f('AvgD','B365D','PSD','BbAvD','WHD'),a:f('AvgA','B365A','PSA','BbAvA','WHA'),
    o:f('Avg>2.5','B365>2.5','P>2.5','BbAv>2.5'),u:f('Avg<2.5','B365<2.5','P<2.5','BbAv<2.5')}}
function marketFeat(oh,od,oa,oo,ou){
  let md=null,mo=null;
  if(oh>1&&od>1&&oa>1){const s=1/oh+1/od+1/oa;md=Math.round(((1/oh)-(1/oa))/s*1000)/1000}
  if(oo>1&&ou>1){mo=Math.round((1/oo)/((1/oo)+(1/ou))*1000)/1000}
  return {md,mo};
}
function oddsFromFields(ix,g){const n=i=>i>=0?parseFloat(String(g[i]||'').replace(',','.')):NaN;return marketFeat(n(ix.h),n(ix.d),n(ix.a),n(ix.o),n(ix.u))}

/* ---------- Import CSV (format football-data.co.uk) ---------- */
function parseDate(s){s=String(s||'').trim();let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);if(m){let y=+m[3];if(y<100)y+=2000;return Date.UTC(y,+m[2]-1,+m[1])}m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);return NaN}
function parseCSV(text,fallbackDiv){
  text=String(text).replace(/^﻿/,'');const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return {rows:[],skipped:0,error:'Le fichier ne contient aucune ligne de match.'};
  const c1=(lines[0].match(/,/g)||[]).length,c2=(lines[0].match(/;/g)||[]).length,D=c2>c1?';':',';
  const split=l=>{const o=[];let cur='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"')q=!q;else if(ch===D&&!q){o.push(cur);cur=''}else cur+=ch}o.push(cur);return o.map(x=>x.trim())};
  const head=split(lines[0]);const find=(...ns)=>{for(const n of ns){const i=head.indexOf(n);if(i>=0)return i}return -1};
  const ix={div:find('Div'),date:find('Date'),h:find('HomeTeam','Home'),a:find('AwayTeam','Away'),fh:find('FTHG','HG'),fa:find('FTAG','AG'),hh:find('HTHG'),ha:find('HTAG'),hc:find('HC'),ac:find('AC'),hy:find('HY'),ay:find('AY'),hr:find('HR'),ar:find('AR'),ref:find('Referee')};
  const need={date:'Date',h:'HomeTeam',a:'AwayTeam',fh:'FTHG',fa:'FTAG',hh:'HTHG',ha:'HTAG',hc:'HC',ac:'AC',hy:'HY',ay:'AY'};
  const miss=Object.keys(need).filter(k=>ix[k]<0).map(k=>need[k]);
  if(miss.length)return {rows:[],skipped:0,error:'Colonnes manquantes : '+miss.join(', ')+'.'};
  const rows=[];let skipped=0;const oix=oddsIndex(head);
  for(let i=1;i<lines.length;i++){
    const f=split(lines[i]);const g=k=>ix[k]>=0?(f[ix[k]]||''):'';const n=k=>{const v=g(k);return v===''?NaN:+v};
    const t=parseDate(g('date')),fh=n('fh'),fa=n('fa'),hh=n('hh'),ha=n('ha'),hc=n('hc'),ac=n('ac'),hy=n('hy'),ay=n('ay');
    const hr=ix.hr>=0?(n('hr')||0):0,ar=ix.ar>=0?(n('ar')||0):0;
    if(!g('h')||!g('a')||[t,fh,fa,hh,ha,hc,ac,hy,ay].some(x=>!isFinite(x))||fh<hh||fa<ha){skipped++;continue}
    rows.push({div:(g('div')||fallbackDiv||'LIGUE').trim(),t,h:g('h'),a:g('a'),hg1:hh,ag1:ha,hg2:fh-hh,ag2:fa-ha,hc,ac,hy:hy+hr,ay:ay+ar,ref:g('ref').trim(),...oddsFromFields(oix,f)});
  }
  return {rows,skipped,error:rows.length?null:'Aucune ligne exploitable : résultats ou statistiques vides.'};
}

function parseFixtures(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return [];
  const sp=l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o.map(x=>x.trim())};
  const h=sp(lines[0]),ix=n=>h.indexOf(n),iD=ix('Div'),iDt=ix('Date'),iT=ix('Time'),iH=ix('HomeTeam'),iA=ix('AwayTeam'),iR=ix('Referee'),oix=oddsIndex(h);
  if(iD<0||iDt<0||iH<0||iA<0)return [];
  const out=[];
  for(let i=1;i<lines.length;i++){const f=sp(lines[i]),t=parseDate(f[iDt]);if(!isFinite(t)||!f[iH]||!f[iA])continue;
    out.push({div:f[iD],t,time:iT>=0?f[iT]:'',h:f[iH],a:f[iA],ref:iR>=0?(f[iR]||''):'',...oddsFromFields(oix,f)})}
  return out;
}

/* ---------- Saison simulée de démonstration ---------- */
let DEMO=null;
function demoRows(){
  if(DEMO)return DEMO;
  const R=makeRng(20250816);
  const names=['Lions FC','Aigles SC','Atlético Riverside','Union Portuaire','FC Montagne','Racing Delta','Sporting Lagune','Olympique Savane','AS Fleuve','Étoile du Nord','Dynamo Plateau','CS Baobab','Real Cascade','Inter Volcan','US Marée','AC Horizon','Tonnerre FC','Vita Côte','Renaissance SC','Daring Colline'];
  const T=names.map(n=>{const att=Math.exp(R.norm()*.2),def=Math.exp(R.norm()*.18);return {n,att,def,cat:Math.exp(Math.log(att)*.7+R.norm()*.12),cdef:Math.exp(Math.log(def)*.6+R.norm()*.12),yt:Math.exp(R.norm()*.2),yp:Math.exp(R.norm()*.12),s2:.5+R.u()*.13}});
  const refs=Array.from({length:12},(_,i)=>({n:'Arbitre '+String(i+1).padStart(2,'0'),s:Math.exp(R.norm()*.18)}));
  const N=20;let arr=[...Array(N).keys()];const rounds=[];
  for(let r=0;r<N-1;r++){const pr=[];for(let i=0;i<N/2;i++){const a=arr[i],b=arr[N-1-i];pr.push(r%2?[b,a]:[a,b])}rounds.push(pr);arr=[arr[0],arr[N-1],...arr.slice(1,N-1)]}
  const all=rounds.concat(rounds.map(p=>p.map(([a,b])=>[b,a])));
  const start=Date.UTC(2025,7,16),rows=[];
  all.forEach((pairs,ri)=>{const base=start+ri*7*864e5+(ri>=19?14*864e5:0);
    pairs.forEach(([hi,ai],j)=>{const H=T[hi],A=T[ai],rf=refs[Math.floor(R.u()*refs.length)];
      const lh=1.48*H.att*A.def,la=1.12*A.att*H.def;
      const G=R.gamma(1/.08)*.08,Gy=R.gamma(1/.07)*.07;
      rows.push({div:'DEMO',t:base+(j%3===0?864e5:0),h:H.n,a:A.n,hg1:R.pois(lh*(1-H.s2)),ag1:R.pois(la*(1-A.s2)),hg2:R.pois(lh*H.s2),ag2:R.pois(la*A.s2),
        hc:R.pois(5.6*H.cat*A.cdef*G),ac:R.pois(4.5*A.cat*H.cdef*G),hy:R.pois(1.85*H.yt*A.yp*rf.s*Gy),ay:R.pois(2.15*A.yt*H.yp*rf.s*Gy),ref:rf.n})})});
  rows.sort((x,y)=>x.t-y.t);DEMO=rows;return rows;
}

/* ---------- Ajustement du modèle (attaque/défense bayésien, pondéré dans le temps) ---------- */
function weight(cfg,refTs,t){return cfg.hl>=9999?1:Math.pow(.5,(refTs-t)/(cfg.hl*864e5))}
function fit(rows,refTs,cfg){
  const P=[];for(const r of rows){if(r.t<refTs)P.push(r);else break}
  if(P.length<20)return null;
  const W=P.map(r=>weight(cfg,refTs,r.t));let sw=0;W.forEach(w=>sw+=w);
  const mu={H:{},A:{}};
  for(const m of MET){let a=0,b=0;P.forEach((r,i)=>{a+=W[i]*r['h'+m];b+=W[i]*r['a'+m]});mu.H[m]=Math.max(a/sw,.03);mu.A[m]=Math.max(b/sw,.03)}
  const teams={};
  P.forEach((r,i)=>{for(const n of [r.h,r.a]){const t=teams[n]||(teams[n]={n:0,w:0,att:{},def:{},aA:{},aD:{}});t.n++;t.w+=W[i]}});
  const names=Object.keys(teams),prior={};
  for(const m of MET){
    const p0=cfg.k*(mu.H[m]+mu.A[m])/2;prior[m]=p0;
    names.forEach(n=>{teams[n].att[m]=1;teams[n].def[m]=1});
    for(let it=0;it<4;it++){
      const S={},E={},SD={},ED={};names.forEach(n=>{S[n]=0;E[n]=0;SD[n]=0;ED[n]=0});
      P.forEach((r,i)=>{const w=W[i],th=teams[r.h],ta=teams[r.a],xh=r['h'+m],xa=r['a'+m];
        S[r.h]+=w*xh;E[r.h]+=w*mu.H[m]*ta.def[m];S[r.a]+=w*xa;E[r.a]+=w*mu.A[m]*th.def[m];
        SD[r.h]+=w*xa;ED[r.h]+=w*mu.A[m]*ta.att[m];SD[r.a]+=w*xh;ED[r.a]+=w*mu.H[m]*th.att[m]});
      let ma=0,md=0;
      names.forEach(n=>{const t=teams[n];t.aA[m]=p0+S[n];t.aD[m]=p0+SD[n];t.att[m]=(p0+S[n])/(p0+E[n]);t.def[m]=(p0+SD[n])/(p0+ED[n]);ma+=t.att[m];md+=t.def[m]});
      ma/=names.length;md/=names.length;names.forEach(n=>{teams[n].att[m]/=ma;teams[n].def[m]/=md});
    }
  }
  const ref={},yb=mu.H.y+mu.A.y,pr=cfg.kr*yb;
  P.forEach((r,i)=>{if(!r.ref)return;const th=teams[r.h],ta=teams[r.a];const e=mu.H.y*th.att.y*ta.def.y+mu.A.y*ta.att.y*th.def.y;
    const o=ref[r.ref]||(ref[r.ref]={n:0,raw:0,S:0,E:0});o.n++;o.raw+=r.hy+r.ay;o.S+=W[i]*(r.hy+r.ay);o.E+=W[i]*e});
  for(const n in ref){const o=ref[n];o.a=pr+o.S;o.mul=(pr+o.S)/(pr+o.E);o.avg=o.raw/o.n}
  /* Régression de Poisson bayésienne : ce que les cotes disent du match (écart de force, match ouvert)
     corrige la note des équipes. Priorité forte vers 0 : sans signal net, aucune correction. */
  const mk={};
  for(const m of MET){mk[m]={h:[0,0,0],a:[0,0,0],n:0};}
  const Q=[];P.forEach((r,i)=>{if(cfg.mkt!==false&&r.md!=null&&r.mo!=null)Q.push(i)});
  if(Q.length>=80){
    for(const m of MET)for(const side of ['h','a']){
      let b=[0,0,0];const tau=[1,4,4];
      for(let it=0;it<8;it++){
        const g=[0,0,0],H=[[0,0,0],[0,0,0],[0,0,0]];
        for(const i of Q){const r=P[i],w=W[i],th=teams[r.h],ta=teams[r.a];
          const l0=side==='h'?mu.H[m]*th.att[m]*ta.def[m]:mu.A[m]*ta.att[m]*th.def[m];
          const z=[1,side==='h'?r.md:-r.md,r.mo-.5],e=b[0]*z[0]+b[1]*z[1]+b[2]*z[2],muh=l0*Math.exp(e),x=r[side+m];
          for(let j=0;j<3;j++){g[j]+=w*(x-muh)*z[j];for(let k=0;k<3;k++)H[j][k]+=w*muh*z[j]*z[k]}}
        for(let j=0;j<3;j++){g[j]-=tau[j]*b[j];H[j][j]+=tau[j]}
        const dlt=solve3(H,g);if(!dlt)break;b=b.map((v,j)=>Math.max(-2,Math.min(2,v+dlt[j])));
        if(Math.abs(dlt[0])+Math.abs(dlt[1])+Math.abs(dlt[2])<1e-6)break;
      }
      mk[m][side]=b;
    }
    for(const m of MET)mk[m].n=Q.length;
  }
  const mkMul=(m,side,r)=>{if(r.md==null||r.mo==null||!mk[m].n)return 1;const b=mk[m][side];return Math.exp(b[0]+b[1]*(side==='h'?r.md:-r.md)+b[2]*(r.mo-.5))};

  const disp={};
  for(const m of MET){let num=0,den=0;
    P.forEach((r,i)=>{const th=teams[r.h],ta=teams[r.a];let l=mu.H[m]*th.att[m]*ta.def[m]+mu.A[m]*ta.att[m]*th.def[m];
      l=mu.H[m]*th.att[m]*ta.def[m]*mkMul(m,'h',r)+mu.A[m]*ta.att[m]*th.def[m]*mkMul(m,'a',r);
      if(m==='y'&&r.ref&&ref[r.ref])l*=ref[r.ref].mul;const x=r['h'+m]+r['a'+m];num+=W[i]*((x-l)*(x-l)-l);den+=W[i]*l*l});
    disp[m]=Math.min(.35,Math.max(0,den>0?num/den:0))}
  return {mu,teams,ref,disp,prior,mk,mkMul,n:P.length,nOdds:Q.length,first:P[0].t,last:P[P.length-1].t,refTs};
}
function solve3(A,b){const M=A.map((r,i)=>r.concat([b[i]]));
  for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-12)return null;[M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<3;r++){if(r===c)continue;const f=M[r][c]/M[c][c];for(let k=c;k<4;k++)M[r][k]-=f*M[c][k]}}
  return [M[0][3]/M[0][0],M[1][3]/M[1][1],M[2][3]/M[2][2]]}
function teamP(F,name,m){const t=F.teams[name];if(!t)return {att:1,def:1,aA:F.prior[m],aD:F.prior[m],n:0};return {att:t.att[m],def:t.def[m],aA:t.aA[m],aD:t.aD[m],n:t.n}}

function predict(F,h,a,refName,ctxF,odds){
  const out={},rf=(refName&&F.ref[refName])||null,ob=odds&&odds.md!=null&&odds.mo!=null?odds:null;
  for(const m of MET){
    const H=teamP(F,h,m),A=teamP(F,a,m);let lh=F.mu.H[m]*H.att*A.def,la=F.mu.A[m]*A.att*H.def,cr=0;
    if(ob){lh*=F.mkMul(m,'h',ob);la*=F.mkMul(m,'a',ob)}
    if(m==='y'){const mul=(rf?rf.mul:1)*(ctxF||1);lh*=mul;la*=mul;cr=rf?1/rf.a:0}
    const c=F.disp[m],ch=1/H.aA+1/A.aD,ca=1/A.aA+1/H.aD,lt=lh+la;
    out[m]={lh,la,lt,vh:lh+(c+ch+cr)*lh*lh,va:la+(c+ca+cr)*la*la,vt:lt+(c+cr)*lt*lt+ch*lh*lh+ca*la*la};
  }
  out.mkt=!!(ob&&F.nOdds>=80);out.nh=(F.teams[h]||{n:0}).n;out.na=(F.teams[a]||{n:0}).n;out.ref=rf;
  return out;
}

/* ---------- Marchés ---------- */
const LINES={y:[2.5,3.5,4.5,5.5,6.5],c:[7.5,8.5,9.5,10.5,11.5,12.5],g2:[0.5,1.5,2.5,3.5]};
const UNIT={y:'cartons',c:'corners',g2:'but(s) en 2ᵉ MT'};
function markets(P,hn,an){
  hn=hn||'Domicile';an=an||'Extérieur';const D={},byKey={},groups={y:[],c:[],g2:[]};
  const add=(m,o)=>{o.m=m;groups[m].push(o);byKey[o.k]=o};
  for(const m of ['y','c','g2']){
    const kmax=m==='g2'?20:45;D[m]=nbmv(P[m].lt,P[m].vt,kmax);D[m+'h']=nbmv(P[m].lh,P[m].vh,kmax);D[m+'a']=nbmv(P[m].la,P[m].va,kmax);
    for(const L of LINES[m]){const po=over(D[m],L);add(m,{k:m+'|o|'+L,side:'o',line:L,label:'Plus de '+fr(L)+' '+UNIT[m],p:po});add(m,{k:m+'|u|'+L,side:'u',line:L,label:'Moins de '+fr(L)+' '+UNIT[m],p:1-po})}
  }
  D.g1=nbmv(P.g1.lt,P.g1.vt,20);const c21=cmp(D.g2,D.g1);
  add('g2',{k:'g2|more',extra:1,label:'2ᵉ MT plus prolifique que la 1ʳᵉ',p:c21.gt});
  add('g2',{k:'g2|notless',extra:1,label:'2ᵉ MT au moins aussi prolifique',p:c21.gt+c21.eq});
  add('g2',{k:'g2|btts',extra:1,label:'Les deux équipes marquent en 2ᵉ MT',p:(1-D.g2h[0])*(1-D.g2a[0])});
  add('g2',{k:'g2|h',extra:1,label:hn+' marque en 2ᵉ MT',p:1-D.g2h[0]});
  add('g2',{k:'g2|a',extra:1,label:an+' marque en 2ᵉ MT',p:1-D.g2a[0]});
  const cc=cmp(D.ch,D.ca);
  add('c',{k:'c|h',extra:1,label:hn+' obtient plus de corners',p:cc.gt});
  add('c',{k:'c|a',extra:1,label:an+' obtient plus de corners',p:cc.lt});
  add('c',{k:'c|h45',extra:1,label:hn+' plus de 4,5 corners',p:over(D.ch,4.5)});
  add('c',{k:'c|a45',extra:1,label:an+' plus de 4,5 corners',p:over(D.ca,4.5)});
  add('y',{k:'y|h15',extra:1,label:hn+' plus de 1,5 carton',p:over(D.yh,1.5)});
  add('y',{k:'y|a15',extra:1,label:an+' plus de 1,5 carton',p:over(D.ya,1.5)});
  return {D,byKey,groups};
}
function outcome(k,r){
  const [m,s,L]=k.split('|');const tot=m==='y'?r.hy+r.ay:m==='c'?r.hc+r.ac:r.hg2+r.ag2;
  if(s==='o')return tot>+L?1:0;if(s==='u')return tot<+L?1:0;
  switch(k){
    case 'g2|more':return (r.hg2+r.ag2)>(r.hg1+r.ag1)?1:0;
    case 'g2|notless':return (r.hg2+r.ag2)>=(r.hg1+r.ag1)?1:0;
    case 'g2|btts':return r.hg2>0&&r.ag2>0?1:0;
    case 'g2|h':return r.hg2>0?1:0;case 'g2|a':return r.ag2>0?1:0;
    case 'c|h':return r.hc>r.ac?1:0;case 'c|a':return r.ac>r.hc?1:0;
    case 'c|h45':return r.hc>4.5?1:0;case 'c|a45':return r.ac>4.5?1:0;
    case 'y|h15':return r.hy>1.5?1:0;case 'y|a15':return r.ay>1.5?1:0;
  }
  return 0;
}
const dummy={};for(const m of MET)dummy[m]={lh:1,la:1,lt:2,vh:1.2,va:1.2,vt:2.4};
const KEYS=Object.keys(markets(dummy).byKey);
const KMETA=KEYS.map(k=>{const o=markets(dummy).byKey[k];return {k,m:o.m,side:o.side,line:o.line,extra:!!o.extra}});

/* La ligne la plus ambitieuse au-dessus du seuil, par marché et par sens, plus les marchés spéciaux */
function selectPicks(probs,thr){
  const out=[],best={};
  for(let j=0;j<KEYS.length;j++){const p=probs[j],mt=KMETA[j];if(!(p>=thr)||p>=.97)continue;
    if(mt.extra){out.push(j);continue}const g=mt.m+'|'+mt.side;if(best[g]==null||probs[best[g]]>p)best[g]=j}
  return out.concat(Object.values(best));
}

/* ---------- Simulation Monte Carlo ---------- */
function simulate(F,fx,P,N){
  const R=makeRng(hashStr([fx.id,fx.h,fx.a,fx.date,fx.ref,fx.ctx,N].join('|')));
  const rf=(fx.ref&&F.ref[fx.ref])||null,res={},kmax={y:20,c:30,g2:10};
  for(const m of ['y','c','g2']){
    const H=teamP(F,fx.h,m),A=teamP(F,fx.a,m),c=F.disp[m],arr=new Int16Array(N),pr=P[m];
    for(let s=0;s<N;s++){
      const nh=R.gamma(H.aA)/H.aA*R.gamma(A.aD)/A.aD,na=R.gamma(A.aA)/A.aA*R.gamma(H.aD)/H.aD;
      const sr=(m==='y'&&rf)?R.gamma(rf.a)/rf.a:1,G=c>.005?R.gamma(1/c)*c:1;
      arr[s]=R.pois(pr.lh*nh*sr*G)+R.pois(pr.la*na*sr*G);
    }
    const hist=new Array(kmax[m]+1).fill(0);for(let s=0;s<N;s++)hist[Math.min(arr[s],kmax[m])]++;
    const sorted=Array.from(arr).sort((a,b)=>a-b),q=x=>sorted[Math.min(N-1,Math.floor(x*N))];
    res[m]={hist:hist.map(x=>x/N),p5:q(.05),p50:q(.5),p95:q(.95),over:{}};
    for(const L of LINES[m]){let k=0;for(let s=0;s<N;s++)if(arr[s]>L)k++;res[m].over[L]=k/N}
  }
  return res;
}

/* ---------- Profil d'équipe ---------- */
function profile(rows,refTs,team,cfg){
  let w=0,n=0;const s={g1:0,g2:0,g2c:0,cf:0,ca:0,yf:0,ya:0},last=[];
  for(const r of rows){if(r.t>=refTs)break;const home=r.h===team;if(!home&&r.a!==team)continue;
    const wt=weight(cfg,refTs,r.t),me=home?'h':'a',op=home?'a':'h';w+=wt;n++;
    s.g1+=wt*r[me+'g1'];s.g2+=wt*r[me+'g2'];s.g2c+=wt*r[op+'g2'];s.cf+=wt*r[me+'c'];s.ca+=wt*r[op+'c'];s.yf+=wt*r[me+'y'];s.ya+=wt*r[op+'y'];last.push(r)}
  if(!n)return null;for(const k in s)s[k]/=w;s.n=n;s.share=(s.g1+s.g2)>0?s.g2/(s.g1+s.g2):null;s.last=last.slice(-6);return s;
}

return {parseFixtures,marketFeat,MET,DIVN,LINES,KEYS,KMETA,fr,parseCSV,parseDate,demoRows,fit,predict,markets,outcome,selectPicks,simulate,profile,nbmv,makeRng};
})();
