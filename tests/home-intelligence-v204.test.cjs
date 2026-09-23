const assert=require('assert');
const Home=require('../home-refresh-v2.js');

const clone=x=>JSON.parse(JSON.stringify(x));
const NOW=new Date('2026-09-17T12:00:00+02:00');

function baseState(){
  return{
    stores:[
      {id:'a',enseigne:'Boulanger',ville:'Alpha',active:true},
      {id:'b',enseigne:'Darty',ville:'Beta',active:true},
      {id:'c',enseigne:'But',ville:'Gamma',active:true}
    ],
    plan:{Lundi:['a','a'],Mardi:['b'],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
    settings:{target:5},
    visits:{},
    appointments:[],
    businessV2:{visits:[],actions:[],opportunities:[],storeSnapshots:{}}
  }
}
function emptyEnv(){return{now:NOW,pilotage:{rows:[]},performance:{rows:[]},opportunities:[],recommended:null,appointment:null}}

// Sans rendez-vous ni signal métier, aucune grosse carte vide ne monopolise la grille.
{
  const state=baseState(),cards=Home.buildActivityCards(state,emptyEnv());
  assert.strictEqual(cards.some(c=>c.id==='appointment'),false,'pas de carte rendez-vous vide');
  assert.strictEqual(cards.some(c=>/retard/i.test(c.label)),false,'pas de carte 0 en retard');
  assert.strictEqual(cards.length,1,'la progression semaine reste le repli utile');
  assert.strictEqual(cards[0].id,'week');
  /* V245 : trois passages physiques (a deux fois + b), unité de settings.target. */
  assert.strictEqual(cards[0].value,'3 magasins planifiés','les magasins planifiés ne sont pas confondus avec les crédits');
  assert(cards[0].sub.includes('6 crédits de visite'),'Boulanger x2 deux fois + Darty x2 = six crédits · '+cards[0].sub);
  assert(cards[0].sub.includes('objectif 5 magasins'),'l’objectif garde son unité réelle : des magasins · '+cards[0].sub);
  assert(!/objectif 5 visites/.test(cards[0].sub),'l’objectif n’est plus libellé en visites');
}

// Une action échue doit passer avant une information neutre.
{
  const state=baseState();
  state.businessV2.actions.push({id:'act-a',storeId:'a',status:'open',dueDate:'2026-09-10'});
  const env=emptyEnv();
  env.pilotage={rows:[{store:state.stores[0],priority:32,age:40,late:10,pdl:null,alerts:0,openActions:1,reasons:['1 action ouverte']} ]};
  const cards=Home.buildActivityCards(state,env);
  assert.strictEqual(cards[0].id,'action-now');
  assert(cards[0].sub.includes('action échue'));
  assert(cards.findIndex(c=>c.id==='week')>0);
}

// La performance sous cible explique la priorité sans score nu.
{
  const state=baseState(),env=emptyEnv();
  env.pilotage={rows:[{store:state.stores[0],priority:61,age:54,late:24,pdl:null,alerts:0,openActions:0,reasons:['Visite en retard de 24 j']} ]};
  env.performance={rows:[{storeId:'a',prio:'P1',status:{underTarget:true,gap:-3.2}}]};
  const cards=Home.buildActivityCards(state,env),now=cards.find(c=>c.id==='action-now');
  assert(now,'le magasin prioritaire doit remonter');
  assert(now.sub.includes('PDM -3,2 pts vs cible'));
  assert(now.sub.includes('Visite en retard de 24 j'));
  assert(!/\b61\b/.test(now.value+' '+now.sub),'le score du moteur ne doit pas être affiché nu');
  assert(!/PDL/.test(now.sub),'une PDL absente ne doit pas être inventée');
}

// Une opportunité ouverte avec échéance est visible et explicite.
{
  const state=baseState(),env=emptyEnv();
  env.opportunities=[{id:'opp-a',storeId:'a',status:'open',dueDate:'2026-09-20',updatedAt:'2026-09-17T08:00:00Z'}];
  const cards=Home.buildActivityCards(state,env),opp=cards.find(c=>c.id==='opportunities');
  assert(opp,'la carte opportunités doit apparaître');
  assert.strictEqual(opp.value,'1 opportunité ouverte');
  assert(opp.sub.includes('échéance sous 7 j'));
}

// Maximum quatre cartes, textes utiles, aucune mutation métier.
{
  const state=baseState();
  state.businessV2.actions.push({id:'act-a',storeId:'a',status:'open',dueDate:'2026-09-10'});
  const env=emptyEnv();
  env.pilotage={rows:[
    {store:state.stores[0],priority:72,age:60,late:30,pdl:12,alerts:1,openActions:1,reasons:['Représentation marque faible']},
    {store:state.stores[1],priority:45,age:38,late:8,pdl:null,alerts:0,openActions:0,reasons:['Visite en retard de 8 j']}
  ]};
  env.performance={rows:[
    {storeId:'a',prio:'P1',status:{underTarget:true,gap:-4}},
    {storeId:'b',prio:'P1',status:{underTarget:true,gap:-1.5}}
  ]};
  env.opportunities=[{id:'opp-c',storeId:'c',status:'open',dueDate:'2026-09-16',updatedAt:'2026-09-16T08:00:00Z'}];
  env.recommended=state.stores[1];
  env.appointment={a:{date:'2026-09-18',time:'10:30',storeId:'c'},d:new Date('2026-09-18T10:30:00+02:00')};
  const before=clone(state),cards=Home.buildActivityCards(state,env);
  assert(cards.length<=4,'la grille reste limitée à quatre cartes');
  assert.deepStrictEqual(state,before,'le calcul accueil est strictement en lecture seule');
  for(const c of cards){
    assert(c.label.trim()&&c.value.trim()&&c.sub.trim(),'aucun texte vide');
    assert(!/NaN/.test(JSON.stringify(c)),'aucun NaN affichable');
    assert(!/^\d+(?:[.,]\d+)?$/.test(c.value.trim()),'aucun chiffre nu comme valeur principale');
  }
}

console.log('home-intelligence-v204: OK');
