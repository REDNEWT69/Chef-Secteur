const fs=require('fs');
const path=require('path');

const file=path.join(__dirname,'..','range-planner-v2.js');
let source=fs.readFileSync(file,'utf8');

function replaceOnce(label,before,after){
  const first=source.indexOf(before);
  if(first<0)throw new Error(label+': bloc source introuvable');
  if(source.indexOf(before,first+before.length)>=0)throw new Error(label+': bloc source trouvé plusieurs fois');
  source=source.slice(0,first)+after+source.slice(first+before.length);
}

replaceOnce('selection par crédits et rotation équilibrée',`function selectionNeed(pool,usable,target,max){
  /* La capacité d'une période se mesure en crédits : un magasin imposé à 2 crédits
     consomme deux unités du plafond, sinon on annonce une capacité qui n'existe pas. */
  const capacity=max*usable.length,forced=forcedCount(pool),forcedCost=forcedCredits(pool);
  if(forcedCost>capacity)throw new Error('Les magasins posés, imposés ou verrouillés demandent '+forcedCost+' crédit'+(forcedCost>1?'s':'')+' de visite pour seulement '+capacity+' disponible'+(capacity>1?'s':'')+'. Le planning précédent est conservé.');
  return Math.min(Math.max(Math.max(1,target),forced),capacity,pool.length);
}
function chooseStores(pool,usedKeys,lastUsedWeek,target){
  const chosen=[],keys=new Set(),add=s=>{const k=storeKey(s);if(!k||keys.has(k)||chosen.length>=target)return false;chosen.push(s);keys.add(k);return true};
  const forced=pool.filter(s=>forcedRank(s)>0).sort((a,b)=>forcedRank(b)-forcedRank(a)||scoreOf(b)-scoreOf(a));
  for(const s of forced)add(s);
  const fresh=pool.filter(s=>!keys.has(storeKey(s))&&!usedKeys.has(storeKey(s))).sort((a,b)=>scoreOf(b)-scoreOf(a));
  for(const s of fresh)add(s);
  if(chosen.length<target){
    const old=pool.filter(s=>!keys.has(storeKey(s))).sort((a,b)=>{const ka=storeKey(a),kb=storeKey(b),la=lastUsedWeek.get(ka),lb=lastUsedWeek.get(kb);if(la!==lb)return (la==null?-999:la)-(lb==null?-999:lb);return scoreOf(b)-scoreOf(a)});
    for(const s of old)add(s);
  }
  return chosen;
}`,
`function selectionNeed(pool,usable,target,max){
  /* Deux unités différentes coexistent volontairement : target reste un objectif de
     magasins, tandis que maxVisitsPerDay est un budget de crédits. On ne convertit
     donc plus la capacité en crédits en faux « nombre de magasins ». */
  const capacityCredits=max*usable.length,forced=forcedCount(pool),forcedCost=forcedCredits(pool);
  if(forcedCost>capacityCredits)throw new Error('Les magasins posés, imposés ou verrouillés demandent '+forcedCost+' crédit'+(forcedCost>1?'s':'')+' de visite pour seulement '+capacityCredits+' disponible'+(capacityCredits>1?'s':'')+'. Le planning précédent est conservé.');
  return{targetCount:Math.min(Math.max(Math.max(1,target),forced),pool.length),capacityCredits};
}
function chooseStores(pool,usedKeys,useCount,lastUsedWeek,targetCount,creditBudget){
  const chosen=[],keys=new Set();let credits=0;
  const add=(s,isForced=false)=>{
    const k=storeKey(s),cost=visitCredit(s);
    if(!k||keys.has(k)||chosen.length>=targetCount)return false;
    if(!isForced&&credits+cost>creditBudget)return false;
    chosen.push(s);keys.add(k);credits+=cost;return true;
  };
  const forced=pool.filter(s=>forcedRank(s)>0).sort((a,b)=>forcedRank(b)-forcedRank(a)||scoreOf(b)-scoreOf(a));
  for(const s of forced)add(s,true);
  /* Un magasin jamais réellement placé reste frais jusqu'à son premier passage.
     Le score ne départage que des magasins du même niveau de fraîcheur. */
  const fresh=pool.filter(s=>!keys.has(storeKey(s))&&!usedKeys.has(storeKey(s))).sort((a,b)=>scoreOf(b)-scoreOf(a));
  for(const s of fresh)add(s);
  /* Une fois le vivier frais épuisé pour le budget restant, équilibrer d'abord le
     nombre réel de passages, puis reprendre le moins récemment utilisé. Le score
     n'intervient qu'en dernier départage. */
  if(chosen.length<targetCount&&credits<creditBudget){
    const old=pool.filter(s=>!keys.has(storeKey(s))).sort((a,b)=>{
      const ka=storeKey(a),kb=storeKey(b),ca=useCount.get(ka)||0,cb=useCount.get(kb)||0;
      if(ca!==cb)return ca-cb;
      const la=lastUsedWeek.get(ka),lb=lastUsedWeek.get(kb);
      if(la!==lb)return (la==null?-999:la)-(lb==null?-999:lb);
      return scoreOf(b)-scoreOf(a);
    });
    for(const s of old)add(s);
  }
  return chosen;
}`);

replaceOnce('priorité de sélection conservée',`  unique.sort((a,b)=>{const la=Number(a.lat)||0,lb=Number(b.lat)||0;if(la!==lb)return la-lb;return (Number(a.lon)||0)-(Number(b.lon)||0)});
`,`  /* Conserver ici l'ordre de sélection (forcé → frais → équilibrage/LRU).
     L'optimisation géographique se fait ensuite dans chaque journée ; la faire avant
     le placement pouvait remettre un magasin déjà vu devant un magasin encore frais. */
`);

replaceOnce('génération semaine',`    const need=selectionNeed(pool,usable,Number(state.settings.target)||20,max);
    const chosen=chooseStores(pool,new Set(),new Map(),need),built=buildWeekUnique(chosen,usable);ensureForcedPlaced(built);const visits=countPlan(built.plan,usable);`,
`    const limits=selectionNeed(pool,usable,Number(state.settings.target)||20,max);
    const chosen=chooseStores(pool,new Set(),new Map(),new Map(),limits.targetCount,limits.capacityCredits),built=buildWeekUnique(chosen,usable);ensureForcedPlaced(built);const visits=countPlan(built.plan,usable);`);

replaceOnce('mémoire période',`    const target=Math.max(1,Number(state.settings.target)||20),max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4)),archive=loadArchive(),first=monday(start),last=monday(end),usedKeys=new Set(),lastUsedWeek=new Map(),unique=new Set();`,
`    const target=Math.max(1,Number(state.settings.target)||20),max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4)),archive=loadArchive(),first=monday(start),last=monday(end),usedKeys=new Set(),useCount=new Map(),lastUsedWeek=new Map(),unique=new Set();`);

replaceOnce('génération période',`      const need=selectionNeed(pool,usable,target,max),remaining=pool.filter(s=>!usedKeys.has(storeKey(s))).length;
      if(usedKeys.size&&remaining<need)usedKeys.clear();
      const chosen=chooseStores(pool,usedKeys,lastUsedWeek,need),built=buildWeekUnique(chosen,usable);ensureForcedPlaced(built);const plan=built.plan,weekSeen=new Set();`,
`      const limits=selectionNeed(pool,usable,target,max);
      const chosen=chooseStores(pool,usedKeys,useCount,lastUsedWeek,limits.targetCount,limits.capacityCredits),built=buildWeekUnique(chosen,usable);ensureForcedPlaced(built);const plan=built.plan,weekSeen=new Set();`);

replaceOnce('compteur de passages',`      for(const d of usable)for(const s of (plan[d]||[])){const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);lastUsedWeek.set(k,weekIndex);totalVisits++;totalCredits+=visitCredit(s)}`,
`      for(const d of usable)for(const s of (plan[d]||[])){const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);useCount.set(k,(useCount.get(k)||0)+1);lastUsedWeek.set(k,weekIndex);totalVisits++;totalCredits+=visitCredit(s)}`);

replaceOnce('version rotation',`rotation:'hard-unique-v7'`,`rotation:'balanced-lru-credit-v8'`);

fs.writeFileSync(file,source);
console.log('PREVIEW PATCH APPLIED: rotation équilibrée + LRU persistante + sélection hebdomadaire bornée en crédits.');
