/* Fabrique un vrai classeur .xlsx en mémoire, pour tester le lecteur sur du format réel.
   Tout est inventé : enseignes génériques, villes fictives, chiffres arbitraires. Aucune
   donnée commerciale n'entre dans le dépôt, et aucun fichier binaire n'est commité. */
const zlib=require('zlib');

const TABLE=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c}return t})();
function crc32(buf){let c=0^-1;for(let i=0;i<buf.length;i++)c=(c>>>8)^TABLE[(c^buf[i])&0xff];return(c^-1)>>>0}

/* Écriture ZIP minimale : une entrée stockée, une entrée dégonflée, pour que le lecteur
   soit exercé sur les deux méthodes de compression qu'on rencontre dans un .xlsx. */
function zip(entries){
  const locals=[],central=[];let offset=0;
  for(const e of entries){
    const name=Buffer.from(e.name,'utf8'),raw=Buffer.from(e.data,'utf8');
    const deflate=e.deflate!==false;
    const body=deflate?zlib.deflateRawSync(raw):raw;
    const head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0,6);
    head.writeUInt16LE(deflate?8:0,8);head.writeUInt32LE(crc32(raw),14);
    head.writeUInt32LE(body.length,18);head.writeUInt32LE(raw.length,22);
    head.writeUInt16LE(name.length,26);head.writeUInt16LE(0,28);
    locals.push(head,name,body);
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(deflate?8:0,10);cd.writeUInt32LE(crc32(raw),16);
    cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(raw.length,24);
    cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);
    central.push(cd,name);
    offset+=head.length+name.length+body.length;
  }
  const cdBuf=Buffer.concat(central),eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(cdBuf.length,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([Buffer.concat(locals),cdBuf,eocd]);
}

const esc=v=>String(v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function colName(i){let s='',n=i+1;while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}

/* Styles : le style 1 est un pourcentage. Une PDM stockée en fraction (0,425) ne doit
   ressortir à 42,5 que parce que le format le dit. */
const STYLES='<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>'
  +'<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';

function build(rows){
  const strings=[],index=new Map();
  const sid=v=>{if(index.has(v))return index.get(v);const i=strings.length;strings.push(v);index.set(v,i);return i};
  const xml=rows.map((cells,r)=>{
    const body=cells.map((cell,c)=>{
      if(cell===null||cell===undefined||cell==='')return'';          // cellule vide : aucune balise
      const ref=colName(c)+(r+1);
      if(typeof cell==='object'&&cell.percent!==undefined)return'<c r="'+ref+'" s="1"><v>'+cell.percent+'</v></c>';
      if(typeof cell==='number')return'<c r="'+ref+'"><v>'+cell+'</v></c>';
      return'<c r="'+ref+'" t="s"><v>'+sid(String(cell))+'</v></c>';
    }).join('');
    return'<row r="'+(r+1)+'">'+body+'</row>';
  }).join('');
  const sheet='<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+xml+'</sheetData></worksheet>';
  const shared='<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'+strings.length+'" uniqueCount="'+strings.length+'">'
    +strings.map(s=>'<si><t>'+esc(s)+'</t></si>').join('')+'</sst>';
  return zip([
    {name:'xl/workbook.xml',data:'<?xml version="1.0"?><workbook><sheets><sheet name="W34" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/sharedStrings.xml',data:shared,deflate:false},   // stockée
    {name:'xl/styles.xml',data:STYLES},
    {name:'xl/worksheets/sheet1.xml',data:sheet}               // dégonflée
  ]);
}

const HEADERS=['Prios','Retailer','Site name','YTD IHS W34','% evol YTD vs LY','Δ YTD W34 vs target',
  'W32','W33','W34','Δ vs target W32','Δ vs target W33','Δ vs target W34',
  'Ecart sell-out € YTD','Ecart sell-out € semaine','Commentaires'];

/* Le secteur du ticket : 51 lignes utiles, 7 Prio 1, 25 Prio 2, 18 À surveiller,
   1 Pas de data, cible 42,5 %. Deux enseignes sans PDM mais avec des écarts sell-out. */
function sectorW34(week){
  const w=week||'W34';
  const head=HEADERS.map(h=>h.replace(/W34/g,w));
  const rows=[['Pilotage hebdomadaire — secteur fictif'],[],head];
  const plan=[['Prio 1',7],['Prio 2',25],['À surveiller',18],['Pas de data',1]];
  const villes=['Villeneuve-Fictive','Bourg-Imaginaire','Sainte-Fable','Val-Chimère','Pont-Récit','Monts-Fictifs','Clair-Songe','Haute-Fable','Roche-Feinte','Bois-Fictif'];
  let n=0;
  for(const [label,count] of plan)for(let i=0;i<count;i++,n++){
    const ville=villes[n%villes.length]+' '+(Math.floor(n/villes.length)+1);
    const sansPdm=label==='Pas de data'||n===0||n===8;      // deux enseignes sans PDM, et la ligne « Pas de data »
    const retailer=n===0?'Auchan':n===8?'BUT':['Darty','Boulanger','Fnac','Conforama','Schmidt'][n%5];
    const pdm=sansPdm?null:{percent:(0.30+((n*7)%25)/100).toFixed(4)};
    const delta=sansPdm?null:{percent:(((n*7)%25)/100-0.125).toFixed(4)};
    rows.push([label,retailer,ville,pdm,sansPdm?null:{percent:'0.0'+(n%9)},delta,
      sansPdm?null:{percent:(0.31+((n*5)%20)/100).toFixed(4)},
      sansPdm?null:{percent:(0.32+((n*5)%20)/100).toFixed(4)},
      sansPdm?null:{percent:(0.33+((n*5)%20)/100).toFixed(4)},
      null,null,null,
      -1200-n*37, -85-n*3,
      label==='Prio 1'?'Remonter la PDM services':'']);
  }
  return{bytes:build(rows),expected:{lignes:51,P1:7,P2:25,watch:18,nodata:1,sansPdm:3,target:42.5}};
}

/* En-têtes RECOPIÉS À L'IDENTIQUE du classeur réel « RHONE ALPES W34.xlsx », y compris
   la double espace de « SO€  2026 » et la coquille d'année « W34 2028 ». Les valeurs,
   elles, restent inventées : seuls les noms de colonnes viennent du fichier. */
const HEADERS_REELS=['Prios','Retailer','Site name','YTD IHS W34','% evol YTD vs LY','Δ YTD W34 vs target',
  'W32','W33','W34','Δ vs target W32','Δ vs target W33','Δ vs target W34',
  'Ecart SO€  2026-2025 YTD','Ecart W32 2026-W32 2025','Ecart W33 2026-W33 2025','Ecart W34 2026-W34 2028',
  'Commentaires'];

/* Reproduit la disposition réelle : la cible est écrite en clair en A1, au-dessus du
   tableau, et les enseignes sont abrégées comme dans le fichier livré. */
function sectorReel(){
  const rows=[['Target = 42.5%'],[],HEADERS_REELS];
  const plan=[['Prio 1',7],['Prio 2',25],['À surveiller',18],['Pas de data',1]];
  const villes=['Villeneuve-Fictive','Bourg-Imaginaire','Sainte-Fable','Val-Chimère','Pont-Récit','Monts-Fictifs','Clair-Songe','Haute-Fable','Roche-Feinte','Bois-Fictif'];
  const enseignes=['ED','CONFO','BTLEC EST','Darty','Boulanger'];
  let n=0;
  for(const [label,count] of plan)for(let i=0;i<count;i++,n++){
    const ville=villes[n%villes.length]+' '+(Math.floor(n/villes.length)+1);
    const sansPdm=label==='Pas de data'||n===0;
    const retailer=enseignes[n%enseignes.length];
    const pdm=sansPdm?null:{percent:(0.30+((n*7)%25)/100).toFixed(4)};
    rows.push([label,retailer,ville,
      pdm,
      sansPdm?null:{percent:'0.0'+(n%9)},                       // % evol YTD vs LY
      sansPdm?null:{percent:(((n*7)%25)/100-0.125).toFixed(4)}, // Δ YTD vs target
      sansPdm?null:{percent:(0.31+((n*5)%20)/100).toFixed(4)},
      sansPdm?null:{percent:(0.32+((n*5)%20)/100).toFixed(4)},
      sansPdm?null:{percent:(0.33+((n*5)%20)/100).toFixed(4)},
      null,null,null,
      -1200-n*37,          // Ecart SO€ YTD
      -85-n*3,             // Ecart W32
      -90-n*3,             // Ecart W33
      -95-n*3,             // Ecart W34
      label==='Prio 1'?'Remonter la PDM services':'']);
  }
  return{bytes:build(rows),expected:{lignes:51,P1:7,P2:25,watch:18,nodata:1,target:42.5}};
}

module.exports={zip,build,sectorW34,sectorReel,HEADERS,HEADERS_REELS};
