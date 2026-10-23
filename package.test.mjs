import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync,realpathSync,rmSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,resolve,basename,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createArtifacts,build} from './build.mjs';
import {validatePackage} from './validate-package.mjs';
const root=new URL('./',import.meta.url),scratch=[];
function tempPackage(){const directory=mkdtempSync(join(tmpdir(),'session-flow-package-test-'));scratch.push(realpathSync(directory));const manifest=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));for(const name of ['package.json',...manifest.files.filter(p=>!p.startsWith('lib/'))]){const destination=join(directory,name);mkdirSync(dirname(destination),{recursive:true});copyFileSync(new URL(name,root),destination);}return pathToFileURL(directory+'/');}
after(()=>{for(const directory of scratch){const target=realpathSync(directory);assert.equal(target,directory);assert.equal(dirname(target),realpathSync(tmpdir()));assert(basename(target).startsWith('session-flow-package-test-'));rmSync(target,{recursive:true,force:false});}});

test('build is deterministic and metadata contains hashes not machine identity or time',()=>{
  const first=createArtifacts(),second=createArtifacts();assert.equal(first.bundle,second.bundle);assert.equal(first.metadataText,second.metadataText);assert.equal(first.metadata.package,JSON.parse(readFileSync(new URL('package.json',root),'utf8')).name);assert.equal(first.metadata.sources['client.css'].length,64);assert(!('at' in first.metadata));assert(!first.bundle.includes(fileURLToPath(root)));assert(!first.metadataText.includes(fileURLToPath(root)));
});
test('clean relocated package builds without dependencies or writing its parent',()=>{
  const moved=tempPackage(),parent=new URL('../',moved),before=readdirSync(parent).sort();const metadata=build({root:moved});const afterFiles=readdirSync(parent).sort();assert.deepEqual(before,afterFiles);assert.equal(metadata.sha256,createArtifacts().metadata.sha256);assert.equal(readFileSync(new URL('lib/client.js',moved),'utf8'),createArtifacts().bundle);assert.equal(existsSync(new URL('node_modules/',moved)),false);assert.equal(validatePackage(moved).ok,true);
});
test('check refuses stale source, bundle and metadata rather than silently repairing it',()=>{
  const moved=tempPackage();build({root:moved});assert.doesNotThrow(()=>build({root:moved,check:true}));const css=new URL('client.css',moved),content=readFileSync(css,'utf8');writeFileSync(css,content+'\n/* changed */\n');assert.throws(()=>build({root:moved,check:true}),/BUILT_CLIENT_STALE/);writeFileSync(css,content);const info=new URL('lib/build-info.json',moved);writeFileSync(info,'{}');assert.throws(()=>build({root:moved,check:true}),/BUILD_INFO_STALE/);
});
test('manifest identity comes from package rather than this workstation build name',()=>{
  const moved=tempPackage(),file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));manifest.name='dsh-session-flow-example';writeFileSync(file,JSON.stringify(manifest));const bundle=createArtifacts(moved).bundle;let identity;vm.runInNewContext(bundle,{window:{__ModuleLoader__:{load:entry=>{identity=entry.id;}}}});assert.equal(identity,manifest.name);assert.equal(createArtifacts(moved).metadata.package,manifest.name);
});
test('malformed package names and runtime imports fail before bundle emission',()=>{
  const moved=tempPackage(),file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));manifest.name='bad name';writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>createArtifacts(moved),/INVALID_PACKAGE_NAME/);manifest.name='dsh-safe-example';writeFileSync(file,JSON.stringify(manifest));const ui=new URL('client-ui.mjs',moved);writeFileSync(ui,"import unsafe from 'outside';\n"+readFileSync(ui,'utf8'));assert.throws(()=>createArtifacts(moved),/UNBUNDLED_RUNTIME_IMPORT/);
});
test('public metadata, packaging allowlist and source boundary are release ready',()=>{
  const manifest=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));assert.equal(manifest.private,false);assert.equal(manifest.license,'MIT');assert.equal(manifest.author,'sensenzi');assert.equal(manifest.repository.url,'git+https://github.com/sensen-jo/dsh-plugin-goal-map.git');assert(manifest.files.includes('LICENSE'));assert.equal(new Set(['package.json',...manifest.files]).size,27);
  const local=validatePackage();assert.equal(local.ok,true,JSON.stringify(local.errors));assert.equal(local.releaseReady,true);const release=validatePackage(undefined,{release:true});assert.equal(release.ok,true,JSON.stringify(release.errors));assert.equal(release.releaseReady,true);assert.deepEqual(release.releaseBlockers,[]);
});
for(const[field,blocker]of [['license','license'],['author','identity'],['repository','repository']]){
  test('public release rejects a relocated package missing '+field,()=>{
    const moved=tempPackage();build({root:moved});assert.equal(validatePackage(moved,{release:true}).releaseReady,true);
    const file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));delete manifest[field];writeFileSync(file,JSON.stringify(manifest));
    const release=validatePackage(moved,{release:true});assert.equal(release.ok,false);assert.equal(release.releaseReady,false);assert(release.releaseBlockers.some(message=>message.includes(blocker)),JSON.stringify(release));
  });
}
test('public release rejects a relocated package without the full LICENSE file',()=>{
  const moved=tempPackage();build({root:moved});assert.equal(validatePackage(moved,{release:true}).releaseReady,true);const license=new URL('LICENSE',moved);assert.equal(existsSync(license),true);unlinkSync(license);
  const release=validatePackage(moved,{release:true});assert.equal(release.ok,false);assert.equal(release.releaseReady,false);assert(release.errors.some(message=>message.includes('Packaged file missing: LICENSE')));assert(release.releaseBlockers.some(message=>message.includes('license')));
});
test('public release still rejects private true in a relocated package',()=>{
  const moved=tempPackage();build({root:moved});assert.equal(validatePackage(moved,{release:true}).releaseReady,true);const file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));manifest.private=true;writeFileSync(file,JSON.stringify(manifest));
  const release=validatePackage(moved,{release:true});assert.equal(release.ok,false);assert.equal(release.releaseReady,false);assert(release.releaseBlockers.some(message=>message.includes('private')));
});
test('archive validation rejects parent references and unreviewed artifacts',()=>{
  const moved=tempPackage(),file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));manifest.files.push('../outside.json','profiles.json');writeFileSync(new URL('profiles.json',moved),'{}');writeFileSync(file,JSON.stringify(manifest));build({root:moved});const result=validatePackage(moved);assert.equal(result.ok,false);assert(result.errors.some(s=>s.includes('Unsafe')));assert(result.errors.some(s=>s.includes('Local artifact')));
});
test('packaging validation rejects URL-like, encoded, absolute and duplicate paths',()=>{
  const moved=tempPackage(),file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));build({root:moved});
  for(const entry of ['file:///outside.json','https://example.invalid/a','C:/outside.json','%2e%2e/outside.json','model.mjs','lib/../model.mjs','./model.mjs','lib\\\\client.js']){const value={...manifest,files:[...manifest.files,entry]};writeFileSync(file,JSON.stringify(value));const result=validatePackage(moved);assert.equal(result.ok,false,entry);assert(result.errors.some(message=>message.includes('Unsafe')),entry);}
});
test('compatibility declaration keeps an explicitly tested optional host peer rather than engines alone',()=>{
  const moved=tempPackage(),file=new URL('package.json',moved),manifest=JSON.parse(readFileSync(file,'utf8'));build({root:moved});delete manifest.peerDependencies;writeFileSync(file,JSON.stringify(manifest));assert(validatePackage(moved).errors.some(message=>message.includes('DSH peers')));manifest.peerDependencies={'@deepseek-ai/dsh':'0.2.0-rc.2'};delete manifest.peerDependenciesMeta;writeFileSync(file,JSON.stringify(manifest));assert(validatePackage(moved).errors.some(message=>message.includes('another host installation')));
});
test('build module and host entry are import safe and runtime uses only host React',async()=>{
  const host=await import('./index.mjs');assert.equal(typeof host.apply,'function');assert.equal(host.apply(),undefined);const artifact=createArtifacts();let entry;vm.runInNewContext(artifact.bundle,{window:{__ModuleLoader__:{load:value=>{entry=value;}}}});const requests=[];const api=entry.factory(name=>{requests.push(name);if(name==='react')return{createElement(){}};throw Error('unexpected runtime dependency');});assert.deepEqual(requests,['react']);assert.equal(typeof api.apply,'function');assert(api.inject.includes('uiConversation'));
});
