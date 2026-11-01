import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const code=transformSync(readFileSync(new URL('../src/lib/x-quota-manager.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
const marker='synthetic-private-provider-detail';
const headers=['月','総リクエスト数','残りクォータ','最終更新日時'];
const reply=(body,ok=true)=>({ok,json:async()=>body});
const usage=(project_usage='624',project_cap='3000000',cap_reset_day=12,extra={})=>reply({data:{project_usage,project_cap,cap_reset_day,project_id:marker},...extra});
function fixture(replies=[usage()],date='2026-11-01T06:00:00Z'){
 const calls=[],logs=[],exports={},module={exports};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[date]));}}
 runInNewContext(code,{module,exports,Date:FixedDate,AbortSignal,console:{log:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},fetch:async(url,options)=>{
  calls.push({url,options});const response=replies.shift();if(response instanceof Error)throw response;if(!response)throw Error('Unexpected synthetic call');return response;
 }});
 return{api:module.exports,calls,logs};
}
test('provider counter624 and cap3000000 use application cap14000 with resetday12',async()=>{
 const f=fixture(),q=await f.api.getQuotaStatus('synthetic-bearer');
 assert.equal(q.status,'known');assert.equal(q.totalPosts,624);assert.equal(q.providerCap,3000000);assert.equal(q.applicationCap,14000);assert.equal(q.effectiveCap,14000);assert.equal(q.remainingQuota,13376);assert.equal(q.resetDay,12);assert.equal(q.unit,'posts');assert.equal(q.source,'x_usage_api');assert.equal(q.periodSource,'provider_counter');assert.equal(q.checkedAt,'2026-11-01T06:00:00.000Z');assert.equal(q.totalRequests,null);assert.equal(q.lastReset,null);assert.equal(JSON.stringify(q).includes(marker),false);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.body,undefined);assert.equal(new URL(f.calls[0].url).origin,'https://api.x.com');assert.equal(new URL(f.calls[0].url).pathname,'/2/usage/tweets');assert.equal(new URL(f.calls[0].url).searchParams.get('usage.fields'),'project_usage,project_cap,cap_reset_day');assert.equal(f.calls[0].options.signal instanceof AbortSignal,true);
});
for(const [label,count,cap,remaining] of [['lower provider cap',624,1000,376],['genuine provider zero',0,3000000,14000],['zero provider cap',0,0,0],['application exhausted',14000,3000000,0],['application overage',15000,3000000,0],['provider overage',1500,1000,0]])test(label+' retains exact provider consumption',async()=>{
 const q=await fixture([usage(count,cap)]).api.getQuotaStatus('synthetic');assert.equal(q.status,'known');assert.equal(q.totalPosts,count);assert.equal(q.effectiveCap,Math.min(14000,cap));assert.equal(q.remainingQuota,remaining);
});
for(const [label,response]of[
 ['HTTP failure',reply({error:marker},false)],['network failure',Error(marker)],['timeout',Object.assign(Error(marker),{name:'TimeoutError'})],['invalid JSON',{ok:true,json:async()=>{throw Error(marker);}}],['missing data',reply({})],['null data',reply({data:null})],['array data',reply({data:[]})],['missing consumption',reply({data:{project_cap:'3000000',cap_reset_day:12}})],['negative consumption',usage(-1)],['fractional consumption',usage(1.2)],['noncanonical partial count',usage('624x')],['boolean consumption',usage(true)],['unsafe consumption',usage(Number.MAX_SAFE_INTEGER+1)],['infinite consumption',usage(Infinity)],['null cap',usage('624',null)],['negative cap',usage('624',-1)],['invalid reset zero',usage('624','3000000',0)],['invalid reset32',usage('624','3000000',32)],['invalid resetfraction',usage('624','3000000',12.5)],['partial provider error',usage('624','3000000',12,{errors:[{detail:marker}]})],['malformed errors',usage('624','3000000',12,{errors:marker})]
])test(label+' is unknown and cannot imply zero usage or full remaining budget',async()=>{
 const f=fixture([response]),q=await f.api.getQuotaStatus('synthetic');assert.equal(q.status,'unknown');assert.equal(q.totalPosts,null);assert.equal(q.totalRequests,null);assert.equal(q.providerCap,null);assert.equal(q.effectiveCap,null);assert.equal(q.remainingQuota,0);assert.equal(q.resetDay,null);assert.equal(q.lastReset,null);assert.equal(JSON.stringify([q,f.logs]).includes(marker),false);assert.equal(f.calls.length,1);
});
test('missing token makes no provider or Google call',async()=>{
 for(const token of ['',undefined,null,'   ']){const f=fixture([]),q=await f.api.getQuotaStatus(token);assert.equal(q.status,'unknown');assert.equal(q.reason,'missing-token');assert.equal(f.calls.length,0);}
});
test('an empty provider errors array is accepted but account identifiers are not returned',async()=>{
 const f=fixture([usage('624','3000000','12',{errors:[]})]),q=await f.api.getQuotaStatus('synthetic');assert.equal(q.status,'known');assert.equal(JSON.stringify(q).includes(marker),false);
});
test('crossing a calendar month does not locally reset provider consumption',async()=>{
 for(const date of ['2026-10-31T23:59:59Z','2026-11-01T00:00:00Z']){const q=await fixture([usage()],date).api.getQuotaStatus('synthetic');assert.equal(q.totalPosts,624);assert.equal(q.remainingQuota,13376);assert.equal(q.resetDay,12);assert.equal(q.lastReset,null);}
});
test('provider reported reset changes consumption rather than an inferred local date',async()=>{
 const before=await fixture([usage('624')],'2026-11-12T00:00:00Z').api.getQuotaStatus('synthetic');assert.equal(before.totalPosts,624);
 const reset=await fixture([usage('0')],'2026-11-12T00:01:00Z').api.getQuotaStatus('synthetic');assert.equal(reset.totalPosts,0);assert.equal(reset.remainingQuota,14000);
});
test('student estimate reserves a worst-case100 Posts rather than equating one student with one Post',async()=>{
 const f=fixture(),a=await f.api.getAvailableStudentCount('synthetic',1000);assert.equal(f.api.X_POSTS_PER_STUDENT_BOUND,100);assert.equal(a.maxStudents,133);assert.equal(a.canEvaluate,true);
 const low=await fixture([usage(13901)]).api.getAvailableStudentCount('synthetic',1);assert.equal(low.maxStudents,0);assert.equal(low.canEvaluate,false);
 const unknown=await fixture([reply({},false)]).api.getAvailableStudentCount('synthetic',100);assert.equal(unknown.maxStudents,0);assert.equal(unknown.canEvaluate,false);
});
test('invalid requested student counts cannot yield positive admission',async()=>{
 for(const count of [-1,NaN,Infinity,0.5,'1']){const q=await fixture().api.getAvailableStudentCount('synthetic',count);assert.equal(q.canEvaluate,false);assert.equal(q.maxStudents,0);}
});
test('student-success accounting export is removed; provider reads never append ledger rows',async()=>{
 const f=fixture();assert.equal(f.api.recordQuotaUsage,undefined);await f.api.getQuotaStatus('synthetic');assert.equal(f.calls.every(c=>c.options.method==='GET'),true);assert.equal(f.calls.some(c=>String(c.url).includes('googleapis')),false);
});
test('existing valid quota-sheet header and historical records are untouched',async()=>{
 const f=fixture([reply({sheets:[{properties:{title:'X_API_Quota'}}]}),reply({values:[headers,['2026-10',25,13975,'2026-10-30T00:00:00Z']]})]);await f.api.initializeQuotaSheet('synthetic','synthetic-sheet');assert.equal(f.calls.length,2);assert.equal(f.calls.every(c=>c.options.method===undefined),true);
});
test('missing quota sheet creates only structure and headers, never a provider or zero-usage record',async()=>{
 const f=fixture([reply({sheets:[]}),reply({}),reply({})]);await f.api.initializeQuotaSheet('synthetic','synthetic-sheet');assert.equal(f.calls.length,3);assert.equal(f.calls[1].options.method,'POST');assert.equal(f.calls[2].options.method,'PUT');assert.deepEqual(JSON.parse(f.calls[2].options.body).values,[headers]);
});
test('initializer detects metadata/create/header failures without further writes',async()=>{
 for(const replies of [[reply({},false)],[reply({})],[reply({sheets:[]}),reply({},false)],[reply({sheets:[]}),reply({}),reply({},false)]]){const expected=replies.length,f=fixture(replies);await assert.rejects(f.api.initializeQuotaSheet('synthetic','synthetic-sheet'),/initialization failed/);assert.equal(f.calls.length,expected);}
});
test('only an entirely empty existing tab can recover headers; existing malformed data is preserved',async()=>{
 const metadata=()=>reply({sheets:[{properties:{title:'X_API_Quota'}}]});const f=fixture([metadata(),reply({values:[]}),reply({})]);await f.api.initializeQuotaSheet('synthetic','synthetic-sheet');assert.equal(f.calls.length,3);assert.deepEqual(JSON.parse(f.calls[2].options.body).values,[headers]);
 for(const existing of [reply({values:[['existing-private-marker']]}),reply({}),reply({},false)]){const q=fixture([metadata(),existing]);await assert.rejects(q.api.initializeQuotaSheet('synthetic','synthetic-sheet'),/initialization failed/);assert.equal(q.calls.length,2);assert.equal(q.calls.every(c=>!c.options.method),true);}
});
