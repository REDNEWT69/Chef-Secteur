const assert=require('assert');
const Pilotage=require('../sector-pilotage.js');

const state={
  stores:[
    {id:'a',enseigne:'Boulanger',ville:'Alpha',active:true,products:['Brun','Blanc'],intervalDays:30},
    {id:'b',enseigne:'Darty',ville:'Beta',active:true,products:['Brun'],intervalDays:30},
    {id:'c',enseigne:'But',ville:'Gamma',active:true,products:['Blanc'],intervalDays:30},
    {id:'off',enseigne:'Fnac',ville:'Off',active:false,products:['Brun'],intervalDays:30}
  ],
  visits:{
    a:{lastVisit:'2026-09-10',history:['2026-08-10','2026-09-10']},
    b:{lastVisit:'2026-09-11',history:['2026-09-11']}
  },
  businessV2:{
    visits:[
      {id:'va',storeId:'a',status:'completed',completedDate:'2026-09-10',updatedAt:'2026-09-10T18:00:00Z',conclusion:'',preparation:{marketShare:'PDM : 12 %'},arrival:{anomalies:[{id:'anom-a',text:'PLV manquante',family:'brun'}]},sixP:{promotion:[{status:'correct',comment:'PLV à corriger',action:'',family:'brun'}],place:[{status:'opportunity',comment:'Part de linéaire : 18%',action:'',family:'brun'}]},report:{shared:{context:'Magasin récent'},brun:{team:'Marque à renforcer',actions:'',massification:'',omni:'',training:''},blanc:{team:'',actions:'',massification:'',omni:'',training:''}}},
      {id:'vb',storeId:'b',status:'completed',completedDate:'2026-09-11',updatedAt:'2026-09-11T18:00:00Z',conclusion:'',preparation:{marketShare:'Part de marché 31%'},arrival:{anomalies:[]},sixP:{promotion:[{status:'ok',comment:'',action:'',family:'brun'}],place:[{status:'ok',comment:'PDL 35%',action:'',family:'brun'}]},report:{shared:{context:''},brun:{team:'RAS',actions:'',massification:'',omni:'',training:''},blanc:{team:'',actions:'',massification:'',omni:'',training:''}}}
    ],
    actions:[
      {id:'act-a',storeId:'a',visitId:'va',source:'360:anom-a',status:'open',description:'Corriger PLV'}
    ]
  }
};

assert.strictEqual(Pilotage.parsePercent('PDM : 14,5 %',['pdm']),14.5);
assert.strictEqual(Pilotage.parsePercent('Top 30 en moins d’un an',['pdm','part de marche']),null,'ne pas inventer une PDM depuis un autre chiffre');
assert(Pilotage.storeSupportsFamily(state.stores[1],'brun'));
assert(!Pilotage.storeSupportsFamily(state.stores[1],'blanc'));

const all=Pilotage.compute(state,{now:new Date('2026-09-15T12:00:00Z')});
assert.strictEqual(all.total,3,'seuls les magasins actifs comptent');
assert.strictEqual(all.monthVisits,2,'les visites legacy/business sont dédupliquées');
assert.strictEqual(all.lowestPdm.store.id,'a');
assert.strictEqual(all.lowestPdm.pdm,12);
assert.strictEqual(all.lowestPdl.store.id,'a');
assert.strictEqual(all.lowestPdl.pdl,18);
assert.strictEqual(all.rows.find(r=>r.store.id==='c').pdm,null,'une donnée absente reste absente');
assert(all.rows.find(r=>r.store.id==='a').priority>all.rows.find(r=>r.store.id==='b').priority,'les alertes terrain remontent le magasin prioritaire');
assert.strictEqual(all.rows.find(r=>r.store.id==='c').level,'gray','un magasin jamais visité reste à qualifier et ne devient pas une fausse alerte');

const brun=Pilotage.compute(state,{family:'brun',now:new Date('2026-09-15T12:00:00Z')});
assert.strictEqual(brun.total,2,'le filtre BRUN respecte les produits magasin');
assert.strictEqual(brun.rows.some(r=>r.store.id==='c'),false);
const blanc=Pilotage.compute(state,{family:'blanc',now:new Date('2026-09-15T12:00:00Z')});
assert.strictEqual(blanc.total,2,'le filtre BLANC inclut les magasins mixtes et BLANC');
assert.strictEqual(blanc.rows.some(r=>r.store.id==='b'),false);

const performanceRows=[
  {storeId:'b',prio:'P1',pdmYtd:22},
  {storeId:'a',prio:'P2',pdmYtd:44},
  {storeId:'c',prio:'watch',pdmYtd:null}
];
const unified=Pilotage.compute(state,{now:new Date('2026-09-15T12:00:00Z'),performanceRows,performanceWeek:'W37'});
assert.strictEqual(unified.performanceWeek,'W37');
assert.deepStrictEqual(unified.officialCounts,{P1:1,P2:1,watch:1,nodata:0,none:0});
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').officialPriority,'P1');
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').pdm,22,'la PDM YTD du fichier devient la référence quand elle existe');
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').pdmSource,'performance');
assert.strictEqual(unified.rows.find(r=>r.store.id==='c').pdm,null,'le fichier ne transforme pas une PDM vide en zéro');
assert.strictEqual(unified.rows[0].store.id,'b','P1 doit remonter avant le score terrain sans modifier ce score');

console.log('sector-pilotage: OK');
