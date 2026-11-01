import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
import {createAccessMiddleware} from '../src/middleware/access.js';
const moduleCode=transformSync(readFileSync(new URL('../src/lib/x-quota-manager.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
const source=readFileSync(new URL('../src/index.tsx',import.meta.url),'utf8');
const config={jwtSecret:'synthetic-sso-key-'.repeat(4),jobSecret:'synthetic-job-key-'.repeat(4),origin:'https://school.example',dashboardUrl:'https://dashboard.example'};
const response=(body,ok=true)=>({ok,json:async()=>body});
const provider=(count=624,cap=3000000)=>response({data:{project_usage:count,project_cap:cap,cap_reset_day:12,project_id:'synthetic-private-project'}});
function fixture(replies=[],enabled=false){
 const calls=[],logs=[],exports={},module={exports};
 runInNewContext(moduleCode,{module,exports,Date,AbortSignal,console:{log:(...x)=>logs.push(x),error:(...x)=>logs.push(x)},fetch:async(url,options)=>{calls.push({url,options});const r=replies.shift();if(!r)throw Error('Unexpected synthetic call');return r;}});
 const app=new Hono();let otherCalls=0,googleTokens=0;
 app.use('*',createAccessMiddleware(config));
 for(const path of ["app.post('/api/auto-evaluate-x-only'","app.get('/api/x/quota'"]){
  const start=source.indexOf(path),end=source.indexOf('\n})',start)+4;
  const code=transformSync(source.slice(start,end).replaceAll('await import(','await loadModule('),{loader:'tsx',format:'cjs'}).code;
  runInNewContext(code,{app,console:{log(){},error(){}},getEnv:(_c,key)=>key==='X_SCHEDULED_EVALUATION_ENABLED'?(enabled?'true':''):'synthetic-bearer',getAccessToken:async()=>{googleTokens++;throw Error('Google is not a provider meter');},loadModule:async name=>{if(name==='./lib/x-quota-manager')return module.exports;otherCalls++;throw Error('Forbidden DB/provider module');}});
 }
 const auth=role=>({Origin:config.origin,Cookie:'wannav_sso='+jwt.sign({type:'sso',userId:7,username:'synthetic',role,targetUrl:config.origin},config.jwtSecret,{algorithm:'HS256',expiresIn:'1h'})});
 return{app,auth,calls,logs,otherCalls:()=>otherCalls,googleTokens:()=>googleTokens};
}
test('unknown provider usage stops authorized enabled X route before DB, Google and evaluation modules',async()=>{
 const f=fixture([response({},false)],true),r=await f.app.request('/api/auto-evaluate-x-only',{method:'POST',headers:f.auth('leader')}),b=await r.json();assert.equal(r.status,503);assert.equal(b.error,'X quota usage unknown');assert.equal(b.quota.totalPosts,null);assert.equal(f.otherCalls(),0);assert.equal(f.googleTokens(),0);assert.equal(f.calls.length,1);
});
test('missing enable flag keeps known quota from starting scheduled X evaluation',async()=>{
 const f=fixture([provider()]),r=await f.app.request('/api/auto-evaluate-x-only',{method:'POST',headers:f.auth('admin')}),b=await r.json();assert.equal(r.status,503);assert.equal(b.executionEnabled,false);assert.equal(f.calls.length,0);assert.equal(f.otherCalls(),0);assert.equal(f.googleTokens(),0);
});
test('unknown usage display stays null with zero permission, no NaN or request-count substitution',async()=>{
 const f=fixture([response({},false)]),r=await f.app.request('/api/x/quota',{headers:f.auth('crew')}),b=await r.json();assert.equal(r.status,200);assert.equal(b.usage.status,'unknown');assert.equal(b.usage.percentage,null);assert.equal(b.usage.canEvaluate,false);assert.equal(b.usage.maxStudents,0);assert.equal(b.quota.totalPosts,null);assert.equal(b.quota.totalRequests,null);assert.equal(f.googleTokens(),0);
});
test('624 provider Posts yield13376 permit Posts but do not resume a paused route',async()=>{
 const f=fixture([provider()]),b=await(await f.app.request('/api/x/quota',{headers:f.auth('crew')})).json();assert.equal(b.quota.totalPosts,624);assert.equal(b.quota.effectiveCap,14000);assert.equal(b.quota.remainingQuota,13376);assert.equal(b.quota.resetDay,12);assert.equal(b.usage.unit,'posts');assert.equal(b.usage.executionEnabled,false);assert.equal(b.usage.canEvaluate,false);assert.equal(b.usage.maxStudents,0);assert.equal(b.usage.estimatedMaxUncachedStudents,133);assert.equal(b.usage.percentage,'4.5%');assert.equal(JSON.stringify(b).includes('synthetic-private-project'),false);
});
test('enabled estimate uses100 Posts per uncached student and smaller provider cap',async()=>{
 const f=fixture([provider(624,1000)],true),b=await(await f.app.request('/api/x/quota',{headers:f.auth('crew')})).json();assert.equal(b.quota.effectiveCap,1000);assert.equal(b.quota.remainingQuota,376);assert.equal(b.usage.percentage,'62.4%');assert.equal(b.usage.canEvaluate,true);assert.equal(b.usage.maxStudents,3);assert.equal(b.usage.maxPostsPerUncachedStudent,100);
});
test('known exhaustion refuses before DB, and a zero provider cap displays no invalid percentage',async()=>{
 const f=fixture([provider(14000)],true),r=await f.app.request('/api/auto-evaluate-x-only',{method:'POST',headers:f.auth('admin')});assert.equal(r.status,429);assert.equal(f.otherCalls(),0);assert.equal(f.googleTokens(),0);
 const z=fixture([provider(0,0)],true),b=await(await z.app.request('/api/x/quota',{headers:z.auth('crew')})).json();assert.equal(b.usage.percentage,null);assert.equal(b.usage.canEvaluate,false);assert.equal(b.usage.maxStudents,0);
});
test('anonymous and crew mutation plus foreign-origin manager remain denied before provider reads',async()=>{
 const f=fixture([],true);assert.equal((await f.app.request('/api/auto-evaluate-x-only',{method:'POST'})).status,401);assert.equal((await f.app.request('/api/auto-evaluate-x-only',{method:'POST',headers:f.auth('crew')})).status,403);assert.equal((await f.app.request('/api/auto-evaluate-x-only',{method:'POST',headers:{...f.auth('admin'),Origin:'https://other.example'}})).status,403);assert.equal(f.calls.length,0);assert.equal(f.otherCalls(),0);
});
