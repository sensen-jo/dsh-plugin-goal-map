// Offline package checks. This file does not publish, read credentials, or access a registry.
import {readFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,createArtifacts} from './build.mjs';

export function validatePackage(root=new URL('./',import.meta.url),{release=false}={}) {
  const errors=[],warnings=[],manifest=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
  const require=(condition,message)=>{if(!condition)errors.push(message);};
  require(manifest.type==='module','Package must be ESM');
  require(manifest.exports?.['.']==='./index.mjs' && manifest.exports?.['./client']==='./lib/client.js','Host/client exports missing');
  require(manifest.dsh?.manifestVersion===1,'Manifest version must be explicit');
  require(manifest.dsh?.client?.platform==='web','Web platform declaration missing');
  require(manifest.dsh?.bundle?.patch==='./cordis.patch.yml','Bundle patch path differs');
  require(manifest.engines?.dsh==='0.2.0-rc.2','Only tested host version may be declared compatible');
  require(manifest.peerDependencies?.['@deepseek-ai/dsh']==='0.2.0-rc.2','Tested rc.2 host enforces DSH peers, not engines.dsh alone');
  require(manifest.peerDependenciesMeta?.['@deepseek-ai/dsh']?.optional===true,'DSH host peer must not trigger another host installation');
  require(Array.isArray(manifest.files) && manifest.files.length>0,'An explicit packaging allowlist is required');
  const packageDirectory=realpathSync(root),seenFiles=new Set();
  for(const entry of manifest.files ?? []) {
    if(typeof entry!=='string' || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(entry) || entry.split('/').some(x=>x==='..'||x==='.') || seenFiles.has(entry.toLowerCase())) {errors.push('Unsafe or unreviewed packaging path: '+String(entry));continue;}
    seenFiles.add(entry.toLowerCase());
    const file=new URL(entry,root);require(existsSync(file),'Packaged file missing: '+entry);
    if(!existsSync(file))continue;
    const actual=realpathSync(file),local=relative(packageDirectory,actual);
    if(lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || isAbsolute(local) || local==='..' || local.startsWith('..'+(process.platform==='win32'?'\\':'/'))) {errors.push('Unsafe packaging target: '+entry);continue;}
    if(/(?:profile|receipt|screenshots?|backup|\.tgz$|^node_modules\/)/i.test(entry))errors.push('Local artifact must not be packed: '+entry);
    if(existsSync(file) && /\.(?:mjs|js|json|md|css|svg|yml)$/.test(entry)) {
      const text=readFileSync(file,'utf8');
      require(!/(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/[^\s/]+\/|127\.0\.0\.1:3080|\.dsh[\\/]profiles)/i.test(text),'Local environment detail in package: '+entry);
    }
  }
  const patch=readFileSync(new URL('cordis.patch.yml',root),'utf8');
  require(patch.includes('name: '+manifest.name),'Patch must name this package');
  const host=readFileSync(new URL('index.mjs',root),'utf8');
  require(!/\b(?:import|require|fetch|setInterval|setTimeout)\s*\(?/.test(host),'Host entry must stay side-effect free');
  const css=readFileSync(new URL('client.css',root),'utf8');
  require(!/@import\b|url\s*\(/i.test(css),'Styles must not load external resources');
  const icon=readFileSync(new URL('icon.svg',root),'utf8');
  require(Buffer.byteLength(icon)<=262144 && !/<script\b|onload\s*=|(?:href|src)\s*=/i.test(icon),'Icon must be static, local and <=256KiB');
  try{build({root,check:true});}catch(error){errors.push(error.message);}
  const releaseBlockers=[];
  if(manifest.private!==false)releaseBlockers.push('private:true prevents publication; remove only after publication authorization');
  if(!manifest.license || manifest.license==='UNLICENSED' || !existsSync(new URL('LICENSE',root)))releaseBlockers.push('Owner-approved public license and full license text required before release');
  if(!manifest.author)releaseBlockers.push('Publisher/maintainer identity must be chosen by owner');
  if(!manifest.repository)releaseBlockers.push('Owner-controlled public repository/issue destination not configured');
  if(manifest.name.endsWith('-local'))releaseBlockers.push('Local development package name must be confirmed or replaced for publication');
  warnings.push(...releaseBlockers);
  if(release)errors.push(...releaseBlockers);
  let artifact;try{artifact=createArtifacts(root).metadata;}catch(error){errors.push(error.message);}
  return {ok:errors.length===0,mode:release?'public-release':'local-candidate',package:manifest.name,version:manifest.version,errors,warnings,releaseReady:errors.length===0 && releaseBlockers.length===0,releaseBlockers,artifact};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2);if(args.some(x=>x!=='--release'))throw Error('UNKNOWN_VALIDATION_OPTION');
  const result=validatePackage(undefined,{release:args.includes('--release')});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
