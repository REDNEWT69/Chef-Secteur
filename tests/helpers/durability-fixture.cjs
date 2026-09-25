/* Secteur synthétique « N mois de terrain » pour les tests de durabilité du stockage.

   100 % fabriqué : le dépôt est public. Aucun magasin, aucune note, aucun client réel.
   Les volumes suivent un usage soutenu : ~4 visites complètes par jour ouvré, un 6P
   rempli à moitié, des comptes rendus BLANC/BRUN, des actions, des opportunités, un
   planning archivé chaque semaine et un import performance hebdomadaire. Le générateur
   est déterministe (graine fixe) pour que les mesures soient rejouables. */
const M=require('../../store-runner-visit-model.js');

function rng(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const WORDS='rayon facing linéaire vendeur démonstration stock rupture promotion concurrence étiquette gamme nouveauté formation équipe responsable implantation merchandising opération sell-out assortiment visibilité PLV client parcours objectif relance'.split(' ');
function sentence(r,n){const out=[];for(let i=0;i<n;i++)out.push(WORDS[Math.floor(r()*WORDS.length)]);const s=out.join(' ');return s.charAt(0).toUpperCase()+s.slice(1)+'.'}

function stores(n){
  return Array.from({length:n},(_,i)=>({id:'st-'+i,enseigne:['Boulanger','Darty','Fnac','Conforama','But','Leclerc'][i%6],
    ville:'Ville-'+i,adresse:(i+1)+' rue de Test',dept:String(38+(i%4)),lat:45.1+i/400,lon:5.7+i/400,active:true,
    priority:(i%5)+1,products:['Brun','Blanc'],freq:2,visitMinutes:60}));
}

/* Un état complet de `months` mois. `visitsPerDay` visites terminées par jour ouvré. */
function build(options={}){
  const months=options.months||12,storeCount=options.stores||60,perDay=options.visitsPerDay||4,r=rng(options.seed||42);
  const list=stores(storeCount);
  const s={schemaVersion:5,profile:{sectorName:'Secteur Test',repName:'',baseName:'Base',baseAddress:'1 rue de Test',baseLat:45.1,baseLon:5.7},
    settings:{days:DAYS.slice(),startTime:'08:30',endTime:'18:00',weekDate:'2026-09-28',visitMinutes:60,target:20},
    stores:list,notes:{},visits:{},included:{},excluded:{},locks:{},plan:{},appointments:[],calendarEvents:[],manualWeekEdits:{}};
  for(const st of list)s.notes[st.id]=sentence(r,40);
  const start=new Date(Date.UTC(2026,8,28));start.setUTCMonth(start.getUTCMonth()-months);
  const end=new Date(Date.UTC(2026,8,28));
  let clock=0;const stamp=d=>new Date(d.getTime()+(clock++%600)*60000).toISOString();
  const archive={};let visitCount=0;
  for(let d=new Date(start);d<end;d.setUTCDate(d.getUTCDate()+1)){
    const dow=d.getUTCDay();if(dow===0||dow===6)continue;
    const day=iso(d);
    for(let k=0;k<perDay;k++){
      const store=list[Math.floor(r()*list.length)];
      const id=M.start(s,store.id);const v=M.getVisit(s,id);
      v.createdAt=v.updatedAt=stamp(d);
      for(const key of Object.keys(M.PREP))if(r()<.5)v.preparation[key]=sentence(r,8);
      v.arrival.checks=v.arrival.checks.map(()=>r()<.7);
      v.arrival.positives=sentence(r,14);v.arrival.opportunities=sentence(r,10);
      if(r()<.4){const aid=M.addAnomaly(s,id);M.editAnomaly(s,id,aid,sentence(r,9))}
      for(const [p,rows] of Object.entries(v.sixP))rows.forEach((row,i)=>{if(r()<.5){M.edit6P(s,id,p,i,'status',['ok','correct','opportunity'][Math.floor(r()*3)]);M.edit6P(s,id,p,i,'comment',sentence(r,10))}if(r()<.08){M.edit6P(s,id,p,i,'action',sentence(r,7));M.edit6P(s,id,p,i,'owner','Vendeur')}});
      for(const scope of ['blanc','brun'])for(const key of Object.keys(M.REPORT_FIELDS))if(r()<.6)M.editReport(s,id,scope,key,sentence(r,30));
      M.editReport(s,id,'shared','context',sentence(r,25));
      v.conclusion=sentence(r,20);
      M.complete(s,id,day);v.completedAt=v.updatedAt=stamp(d);
      for(const a of s.businessV2.actions)if(a.visitId===id){a.createdAt=a.updatedAt=v.completedAt}
      visitCount++;
      if(r()<.3){s.businessV2.opportunities=s.businessV2.opportunities||[];const t=v.completedAt;
        s.businessV2.opportunities.push({id:'opp-'+visitCount,storeId:store.id,visitId:id,source:'visit',category:'massification',description:sentence(r,12),owner:'',dueDate:'',status:'open',closedAt:null,createdAt:t,updatedAt:t})}
    }
    if(dow===1){
      const week=day,plan={};
      for(const dn of DAYS)plan[dn]=Array.from({length:5},()=>{const st=list[Math.floor(r()*list.length)];return{id:st.id,enseigne:st.enseigne,ville:st.ville,adresse:st.adresse,dept:st.dept,lat:st.lat,lon:st.lon,freq:st.freq,priority:st.priority,lastVisit:'',intervalDays:14,visitMinutes:60}});
      archive[week]={weekMonday:week,plan,manualEdited:r()<.3,generatedMode:'snail-distance-v1',updatedAt:stamp(d)};
      if(archive[week].manualEdited)s.manualWeekEdits[week]={at:stamp(d),plan};
      if(r()<.5)s.appointments.push({id:'rdv-'+week,storeId:list[Math.floor(r()*list.length)].id,date:day,time:'10:00',duration:60,type:'visite',note:sentence(r,6)});
      for(let e=0;e<6;e++)s.calendarEvents.push({id:'ev-'+week+'-'+e,date:day,title:sentence(r,3),start:day+'T09:00:00',end:day+'T10:00:00',allDay:false});
    }
  }
  const perf={version:2,imports:[],mapping:{},treated:{}};
  const weeks=Math.round(months*4.3);
  for(let w=0;w<weeks;w++)perf.imports.push({week:'W'+((w%52)+1),targetPdm:42.5,targetSource:'explicite',importedAt:new Date(start.getTime()+w*7*864e5).toISOString(),
    rows:list.map(st=>({key:st.enseigne+'|'+st.ville,retailer:st.enseigne,site:st.ville,prio:'P2',pdmYtd:40+r()*5,evolYtd:r(),deltaYtd:r(),weeks:{},deltaWeeks:{},sellOutWeeks:{},sellOutYtd:Math.round(r()*900),sellOutWeek:Math.round(r()*30),comment:'',storeId:null}))});
  return{state:s,archive,range:{start:iso(start),end:iso(end),weeks},catalog:[],performance:perf,visitCount};
}

/* Taille d'une valeur telle que `localStorage` la compte (unités UTF-16 : clé + valeur). */
function units(key,value){return String(key).length+String(value).length}

module.exports={build,stores,units,rng,sentence};
