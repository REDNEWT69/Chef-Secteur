const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'..');
for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.js')))cp.execFileSync(process.execPath,['--check',path.join(root,name)]);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chef-inline-'));
try{for(const name of ['index.html','src/chef-secteur.html']){const html=fs.readFileSync(path.join(root,name),'utf8');let n=0;for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){const f=path.join(temp,(n++)+'.js');fs.writeFileSync(f,match[1]);cp.execFileSync(process.execPath,['--check',f]);}}}finally{fs.rmSync(temp,{recursive:true})}
console.log('PASS: all app modules and inline scripts parse');
