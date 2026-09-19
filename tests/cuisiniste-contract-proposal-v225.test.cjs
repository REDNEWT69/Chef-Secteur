const assert=require('assert/strict');
const fs=require('fs');

class DB{
  constructor(){this.map=new Map()}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){this.map.set(String(k),String(v))}
  removeItem(k){this.map.delete(String(k))}
}

const beforePlan={Lundi:[{id:'keep-me'}]};
global.state={
  stores:[
    {id:'s1',enseigne:'SCHMIDT',ville:'Ville Alpha'},
    {id:'s2',enseigne:'SCHMIDT',ville:'Ville Beta'},
    {id:'s3',enseigne:'SCHMIDT',ville:'Ville Gamma'}
  ],
  plan:structuredClone(beforePlan),settings:{}
};
const db=new DB();global.__chefStorage=db;global.localStorage=db;
const C=require('../cuisiniste-contracts-v193.js');
const P=require('../cuisiniste-contract-proposal-v225.js');

const tracking={type:'tracking',sector:'Secteur Test',sites:[
  {key:'SCH-VILLE ALPHA FR-00001',brand:'SCHMIDT',city:'Ville Alpha',cityKey:'ville alpha',postal:'00001',activeContract:null,lastContract:{group:'GROUPE A',status:'Finalisé'}},
  {key:'SCH-VILLE BETA FR-00002',brand:'SCHMIDT',city:'Ville Beta',cityKey:'ville beta',postal:'00002',activeContract:null,lastContract:{group:'GROUPE A',status:'Finalisé'}},
  {key:'SCH-VILLE GAMMA FR-00003',brand:'SCHMIDT',city:'Ville Gamma',cityKey:'ville gamma',postal:'00003',activeContract:null,lastContract:{group:'GROUPE B',status:'Finalisé'}}
],importedAt:'2026-09-19T10:00:00.000Z'};
const tariff={type:'tariff',products:[
  {refSchmidt:'A0',refCommercial:'A1',refSap:'A1',family:'REF',segment:'COMBINE',description:'Produit A',type:'BIP',purchasePrice:600,contractObjective:7200,infos:''},
  {refSchmidt:'B0',refCommercial:'B1',refSap:'B1',family:'REF',segment:'ACCESSOIRE',description:'Produit B',type:'ACC',purchasePrice:200,contractObjective:2400,infos:"PAS D'EXPO"},
  {refSchmidt:'X90',refCommercial:'X9',refSap:'X9',family:'REF',segment:'EXCEPTION',description:'Produit exception x9',type:'BIP',purchasePrice:600,contractObjective:5400,infos:'objectif explicite x9'},
  {refSchmidt:'C0',refCommercial:'C1',refSap:'C1',family:'REF',segment:'FOUR',description:'Produit C',type:'BIP',purchasePrice:500,contractObjective:null,infos:''}
],importedAt:'2026-09-19T11:00:00.000Z'};
C.saveTracking(db,tracking);C.saveTariff(db,tariff);

assert.equal(P.noExpo(tariff.products[1]),true,'le marqueur PAS D EXPO doit exclure la référence');
assert.equal(P.eligibleProduct(tariff.products[0]),true);
assert.equal(P.eligibleProduct(tariff.products[1]),false);
assert.equal(P.eligibleProduct(tariff.products[3]),false,'un objectif Contrat Expo absent doit bloquer la proposition');
assert.deepEqual(P.eligibleProducts(db).map(P.productRef),['A1','X9']);

const single=P.buildProposal(db,[{storeId:'s1',refs:['A1','X9']}],global.state.stores);
assert.equal(single.productCount,2);
assert.equal(single.objective,12600,'l’objectif doit être la somme des OBJECTIF Contrat Expo explicites');
assert.equal(single.rules.objectiveSource,'OBJECTIF Contrat Expo');
assert.equal(single.products.find(x=>x.ref==='X9').contractObjective,5400,'l’exception x9 doit rester 5400 et ne jamais devenir prix x12');

assert.throws(()=>P.buildProposal(db,[{storeId:'s1',refs:['A1','B1']}],global.state.stores),/pas d.expo/i);
assert.throws(()=>P.buildProposal(db,[{storeId:'s1',refs:['A1']}],global.state.stores),/entre 2 et 5/i);
assert.throws(()=>P.buildProposal(db,[{storeId:'s1',refs:['A1','A1']}],global.state.stores),/deux fois/i);
assert.throws(()=>P.buildProposal(db,[{storeId:'s1',refs:['A1','C1']}],global.state.stores),/Objectif Contrat Expo absent/i);

const grouped=P.buildProposal(db,[{storeId:'s1',refs:['A1']},{storeId:'s2',refs:['X9']}],global.state.stores);
assert.equal(grouped.stores.length,2);
assert.equal(grouped.productCount,2,'le minimum de deux produits peut être réparti sur deux magasins du même groupement');
assert.equal(grouped.objective,12600);
assert.throws(()=>P.buildProposal(db,[{storeId:'s1',refs:['A1']},{storeId:'s3',refs:['X9']}],global.state.stores),/même groupement/i);

assert.deepEqual(global.state.plan,beforePlan,'le moteur de proposition ne doit jamais modifier le planning');
const baseSource=fs.readFileSync('cuisiniste-contracts-v193.js','utf8');
assert(baseSource.includes("infos:text(rowValue(row,h.idx,'INFOS'))"),'l’import tarif doit conserver la colonne INFOS pour filtrer pas d’expo');

console.log('cuisiniste-contract-proposal-v225: OK · 2–5 produits, objectif référentiel, pas d’expo, groupement 2 magasins, planning neutre');
