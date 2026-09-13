const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../sector-admin.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));

function rows(brands,prefix='old'){
  return brands.map((enseigne,i)=>({
    id:prefix+'-'+i,enseigne,ville:'Ville '+i,adresse:(i+1)+' rue Test',
    codePostal:'6900'+(i%10),dept:'69',active:true,priority:3,products:[]
  }));
}

function env(oldBrands,selectedBrands){
  const state={
    stores:rows(oldBrands),settings:{brands:selectedBrands.slice()},profile:{},plan:{Lundi:[{id:'old-plan'}]},
    visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[]
  };
  const data=new Map();
  const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  const root={state,localStorage:storage};
  root.ChefReliability={
    capture:s=>({state:clone(s)}),
    checkpoint(){},
    persist(bundle){root.__persisted=clone(bundle)}
  };
  const document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(source,{window:root,document,setTimeout(){}});
  return root;
}

function apply(root,newBrands){
  const next=rows(newBrands,'new');
  root.ChefSectorAdmin.applyExact('Nouveau secteur',next);
  return root.state.settings.brands;
}

// Cas réel : l'ancien secteur avait 5 enseignes et les 5 étaient cochées. Ce filtre
// signifiait donc « Toutes ». Le nouveau secteur en apporte 6 autres : elles ne doivent
// pas devenir exclues simplement parce que l'ancienne liste a survécu à l'import.
{
  const old=['Boulanger','Carrefour','Conforama','Darty','Fnac'];
  const next=old.concat(['BUT','Electro Dépôt','Schmidt','Gitem','E.Leclerc','Pro&Cie']);
  const root=env(old,old);
  assert.deepEqual(apply(root,next),[],"un ancien filtre équivalent à Toutes doit rester Toutes après élargissement du secteur");
  assert.equal(root.state.stores.length,11);
  assert.deepEqual(root.state.plan,{},'le changement de secteur continue à vider le planning');
}

// Un filtre réellement volontaire doit survivre au changement de secteur.
{
  const old=['Boulanger','Carrefour','Conforama','Darty','Fnac'];
  const chosen=['Boulanger','Darty'];
  const root=env(old,chosen);
  assert.deepEqual(apply(root,old.concat(['BUT','Electro Dépôt'])),chosen,
    'une sélection partielle volontaire ne doit jamais être élargie automatiquement');
}

// Si l'univers des enseignes ne change pas, ne toucher à rien même lorsque toutes étaient
// explicitement stockées. On évite ainsi de réécrire les préférences lors d'une simple
// correction d'adresse ou d'un changement de magasin dans les mêmes enseignes.
{
  const old=['Boulanger','Darty','Fnac'];
  const root=env(old,old);
  assert.deepEqual(apply(root,old),old,'même univers : conserver la représentation existante');
}

// La représentation déjà canonique de « Toutes » (tableau vide) reste évidemment vide.
{
  const old=['Boulanger','Darty'];
  const root=env(old,[]);
  assert.deepEqual(apply(root,old.concat(['BUT'])),[],'un filtre déjà sur Toutes reste sur Toutes');
}

console.log('PASS: un changement de secteur conserve le sens du filtre Enseignes sans écraser une sélection volontaire.');
