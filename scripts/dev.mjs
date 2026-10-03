import { connect } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const running=await new Promise(resolve=>{const socket=connect({host:'127.0.0.1',port:7233});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>{socket.destroy();resolve(false);});});
if(!running){
const compose=spawnSync('docker',['compose','up','-d','temporal'],{stdio:'inherit'});
if(compose.status!==0){console.error('Could not start Temporal. Open Docker Desktop and retry.');process.exit(1);}
}
const deadline=Date.now()+60000;
while(true){const ok=await new Promise(resolve=>{const s=connect({host:'127.0.0.1',port:7233});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>{s.destroy();resolve(false);});});if(ok)break;if(Date.now()>deadline)throw Error('Temporal did not become ready.');await new Promise(r=>setTimeout(r,500));}
// Launch Node directly instead of npm.cmd. Compile once before starting both services.
const tsc=fileURLToPath(new URL('../node_modules/typescript/bin/tsc',import.meta.url));
const build=spawnSync(process.execPath,[...process.execArgv,tsc,'--outDir','work/build'],{stdio:'inherit'});
if(build.status!==0)process.exit(build.status??1);
const children=['work/build/src/worker.js','work/build/src/api.js'].map(file=>spawn(process.execPath,[...process.execArgv,file],{stdio:'inherit'}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
for(const child of children){child.on('error',e=>{console.error(e);stop(1);});child.on('exit',code=>{if(!stopping)stop(code??1);});}
console.log('Juniper launching: http://localhost:'+ (process.env.PORT??3000) +' | Temporal: http://localhost:8233');
