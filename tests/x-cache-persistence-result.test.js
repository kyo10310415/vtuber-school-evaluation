import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {Hono} from 'hono';
const source=readFileSync(new URL('../src/index.tsx',import.meta.url),'utf8');
const start=source.indexOf("app.post('/api/auto-evaluate-x-only'");
const next=source.indexOf('\napp.',start+10);
const code=transformSync(source.slice(start,next<0?source.length:next).replace(/await import\(/g,'await loadModule('),{loader:'ts',format:'cjs'}).code;
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-01T06:00:00Z']));}}
function fixture(saveSucceeds,{partial=false,lateUnknown=false,remaining=1000,enabled=true}={}){
 const calls={saved:0,ended:0,quotaReads:0,progressUpdates:0,provider:0,queries:[],accessTokens:0,modules:0};
 const progress={evaluation_month:'2026-10',current_batch_index:0,completed_students:0,total_students:1,is_completed:false};
 const app=new Hono();
 const deps={app,Date:FixedDate,console:{log(){},warn(){},error(){}},
 getEnv:(_c,key)=>key==='X_SCHEDULED_EVALUATION_ENABLED'?(enabled?'true':''):'synthetic-only',getDatabaseConfig:()=>({}),getAccessToken:async()=>{calls.accessTokens++;return 'synthetic-token';},
 fetchStudents:async()=>[{studentId:'synthetic-id',name:'Synthetic',status:'アクティブ',xAccount:'synthetic-x'}],getPreviousEvaluationFromSheet:async()=>null,
 loadModule:async name=>{calls.modules++;
 if(name==='pg')return{Pool:class{async query(sql){calls.queries.push(sql.trim().split(/\s/)[0]);if(/UPDATE x_evaluation_progress/.test(sql))calls.progressUpdates++;return{rows:/SELECT \*/.test(sql)||/INSERT INTO x_evaluation_progress/.test(sql)?[progress]:[]};}async end(){calls.ended++;}}};
 if(name==='./lib/x-quota-manager')return{X_POSTS_PER_STUDENT_BOUND:100,getQuotaStatus:async()=>{calls.quotaReads++;return calls.quotaReads>1&&lateUnknown?{status:'unknown',totalPosts:null,totalRequests:null,remainingQuota:0}:{status:'known',totalPosts:calls.quotaReads>1?13007:14000-remaining,totalRequests:null,remainingQuota:calls.quotaReads>1?993:remaining,unit:'posts',resetDay:12};}};
 if(name==='./lib/x-client')return{evaluateXAccount:async()=>{calls.provider++;return partial?{rateLimited:true,partialData:{followersCount:1,followingCount:1}}:{tweetsInMonth:1,followersCount:1};}};
 if(name==='./lib/evaluation-cache')return{getCachedEvaluation:async()=>null,saveCachedEvaluation:async()=>{calls.saved++;return saveSucceeds;}};
 throw Error('Unexpected synthetic dependency');}
 };
 const keys=Object.keys(deps);new Function(...keys,code)(...keys.map(k=>deps[k]));
 return{app,calls};
}
test('normal X save uses provider Post snapshot, never adds successful students to usage',async()=>{
 const f=fixture(true),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10',{method:'POST'}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.summary.success,1);assert.equal(b.summary.errors,0);assert.equal(b.quota.totalPosts,13007);assert.equal(b.quota.totalRequests,null);assert.equal(f.calls.quotaReads,2);assert.equal(f.calls.saved,1);assert.equal(f.calls.progressUpdates,1);assert.equal(f.calls.ended,1);
});
for(const partial of [false,true])test('failed '+(partial?'partial':'normal')+' cache save retains student error count',async()=>{
 const f=fixture(false,{partial}),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10',{method:'POST'}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.summary.success,0);assert.equal(b.summary.errors,1);assert.equal(f.calls.saved,1);assert.equal(f.calls.quotaReads,2);assert.equal(f.calls.ended,1);
});
test('provider snapshot becoming unknown after processing does not advance progress',async()=>{
 const f=fixture(true,{lateUnknown:true}),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10',{method:'POST'}),b=await r.json();
 assert.equal(r.status,503);assert.equal(b.error,'X quota usage unknown');assert.equal(b.quota.totalPosts,null);assert.equal(f.calls.saved,1);assert.equal(f.calls.progressUpdates,0);assert.equal(f.calls.ended,1);
});
test('99 remaining Posts cannot start a one-student100-Post bounded batch or advance progress',async()=>{
 const f=fixture(true,{remaining:99}),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10',{method:'POST'}),b=await r.json();
 assert.equal(r.status,429);assert.equal(b.requiredPostBudget,100);assert.equal(f.calls.provider,0);assert.equal(f.calls.saved,0);assert.equal(f.calls.progressUpdates,0);assert.equal(f.calls.queries.includes('INSERT'),false);assert.equal(f.calls.ended,1);
});
test('a complete100-Post batch budget is admitted without changing batch size',async()=>{
 const f=fixture(true,{remaining:100}),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10&batchSize=1',{method:'POST'});assert.equal(r.status,200);assert.equal(f.calls.provider,1);
});
test('paused scheduled X evaluation has no credential, quota, DB or provider effects',async()=>{
 const f=fixture(true,{enabled:false}),r=await f.app.request('/api/auto-evaluate-x-only?month=2026-10',{method:'POST'}),b=await r.json();assert.equal(r.status,503);assert.equal(b.error,'X scheduled evaluation paused');assert.equal(f.calls.modules,0);assert.equal(f.calls.accessTokens,0);assert.equal(f.calls.queries.length,0);assert.equal(f.calls.provider,0);
});
for(const size of ['0','101','1x','1.5','-1','Infinity'])test('invalid batch size '+size+' fails before effects',async()=>{
 const f=fixture(true),r=await f.app.request('/api/auto-evaluate-x-only?batchSize='+encodeURIComponent(size),{method:'POST'});assert.equal(r.status,400);assert.equal(f.calls.modules,0);assert.equal(f.calls.accessTokens,0);
});
test('100-Post budget bound remains tied to current one-page100 X-client fetch',()=>{
 const client=readFileSync(new URL('../src/lib/x-client.ts',import.meta.url),'utf8');assert.match(client,/const maxPages = 1/);assert.match(client,/fetchRecentTweets\(bearerToken, user\.userId, 100, targetMonth\)/);
});
