const assert=require('node:assert/strict');
const R=require('../region-stores.js');
const region={code:'84',nom:'Auvergne-Rhône-Alpes'};
const node=(id,extra={})=>({type:'node',id,lat:45.75,lon:4.85,tags:{shop:'electronics',brand:'Boulanger','addr:city':'Lyon','addr:street':'Rue Test',...extra}});
const response=elements=>({elements:[{type:'area',id:3603792877},...elements]});
assert.throws(()=>R.query({code:'84";out;'},['Boulanger']));assert.throws(()=>R.query(region,[]));assert.throws(()=>R.query(region,['Unknown']));
const rows=R.parseOSM(response([node(1),{...node(2),type:'way',lat:undefined,lon:undefined,center:{lat:45.75,lon:4.85}},node(3,{brand:'Darty'}),node(4,{shop:'vacant'}),node(5,{disused:'yes'})]),region,['Boulanger']);
assert.equal(rows.length,1);assert.equal(rows[0].id,'osm-node-1');assert.equal(rows[0].sourceUrl,'https://www.openstreetmap.org/node/1');assert.deepEqual(rows[0].products,['À confirmer']);
assert.throws(()=>R.parseOSM({elements:[],remark:'timeout'},region,['Boulanger']));
assert.deepEqual(R.parseOSM({elements:[]},region,['Boulanger']),[]);
assert.deepEqual(R.parseOSM(response([]),region,['Boulanger']),[]);
const missing=R.parseOSM(response([{...node(10),lat:undefined,lon:undefined,tags:{shop:'electronics',brand:'Boulanger'}}]),region,['Boulanger'])[0];assert(missing.needsGeo);assert.equal(missing.ville,'');assert(!R.coords({lat:null,lon:null}));
assert(R.duplicate(rows[0],[{...rows[0],id:'old',lat:45.7501}]));assert(!R.duplicate(rows[0],[{...rows[0],id:'far',lat:46,adresse:'Autre rue'}]));
const C=require('../reliability-core.js');global.ChefReliability=C;
const db=new Map();global.localStorage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
global.state={schemaVersion:5,stores:[],profile:{},settings:{},visits:{old:'keep'},notes:{old:'note'},plan:{},included:{},excluded:{},locks:{}};
assert.equal(R.commit(rows),1);assert.equal(global.state.stores.length,1);assert.equal(C.backups().length,1);assert.equal(global.state.notes.old,'note');assert.equal(R.commit(rows),0);
const before=JSON.stringify(global.state);assert.throws(()=>R.commit([missing]));assert.equal(JSON.stringify(global.state),before);
const fail=global.localStorage.setItem;global.localStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>R.commit([{...rows[0],id:'new',lat:48,adresse:'Different'}]));assert.equal(JSON.stringify(global.state),before);global.localStorage.setItem=fail;
console.log('PASS: region query validation, brand filtering, node/way deduplication, missing data, partial errors, selected-only import, repeated import, backup and quota protection.');

for(const tags of [
 {shop:'bakery',name:'Boulanger Pâtissier'},
 {shop:'bakery',name:'Boulanger'},
 {shop:'bakery',brand:'Boulanger'},
 {shop:'electronics',name:'Boulanger Pâtissier'},
 {shop:'electronics',brand:'Autre marque',name:'Boulanger Lyon'},
 {shop:'convenience',brand:'Carrefour',name:'Carrefour City'}
])assert.equal(R.matchBrand(tags,R.BRANDS),undefined);
assert.equal(R.matchBrand({shop:'electronics',name:'Boulanger Lyon'},R.BRANDS),'Boulanger');
assert.equal(R.matchBrand({shop:'electronics',brand:'Boulanger',name:'Boulanger Lyon'},R.BRANDS),'Boulanger');
assert.throws(()=>R.commit([{...rows[0],id:'no-address',adresse:'',lat:48}]));
assert.equal(JSON.stringify(global.state),before);
assert(!R.complete({...rows[0],adresse:' '}));
console.log('PASS: bakeries, misleading names, conflicting brands and convenience shops excluded; missing addresses cannot be imported.');
