import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const code=transformSync(readFileSync(new URL('../src/lib/youtube-client.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
const canonical='UC'+'a'.repeat(22), marker='synthetic-private-marker', key='synthetic&key='+marker;
const reply=(body,ok=true)=>({ok,status:ok?200:403,json:async()=>body,text:async()=>marker});
function fixture(replies=[]){
 const calls=[],logs=[],exports={},module={exports};
 runInNewContext(code,{module,exports,URL,URLSearchParams,console:Object.fromEntries(['log','error','warn'].map(k=>[k,(...args)=>logs.push(args)])),require:(name)=>{assert.equal(name,'./grade-calculator');return{calculateYouTubeGrade:()=> 'C'}},fetch:async(url)=>{
  calls.push(new URL(url)); const response=replies.shift(); if(response instanceof Error)throw response;if(!response)throw Error(marker);return response;
 }}); return{api:module.exports,calls,logs};
}
const stats=()=>reply({items:[{id:canonical,statistics:{subscriberCount:'12',viewCount:'20',videoCount:'0'}}]});
test('UC IDs and channel URLs retain id lookup and canonical search',async()=>{
 for(const input of [canonical,`https://www.youtube.com/channel/${canonical}`,`https://m.youtube.com/channel/${canonical}/?view=1`]){
  const f=fixture([stats(),reply({items:[]})]),result=await f.api.evaluateYouTubeChannel(key,input,'2026-10');
  assert.equal(result.subscriberCount,12);assert.equal(f.calls.length,2);assert.equal(f.calls[0].searchParams.get('id'),canonical);assert.equal(f.calls[0].searchParams.has('forHandle'),false);assert.equal(f.calls[0].searchParams.get('key'),key);assert.equal(f.calls[1].searchParams.get('channelId'),canonical);
 }
});
test('bare, dotted, Unicode and URL handles resolve once then pass canonical ID to search',async()=>{
 for(const input of ['@synthetic_handle','@synthetic.handle','@合成テスト','https://www.youtube.com/@synthetic.handle','https://youtube.com/@%E5%90%88%E6%88%90%E3%83%86%E3%82%B9%E3%83%88/?view=1']){
  const f=fixture([stats(),reply({items:[]})]),result=await f.api.evaluateYouTubeChannel(key,input,'2026-10');
  assert.equal(result.subscriberCount,12);assert.equal(f.calls.length,2);assert.equal(f.calls[0].searchParams.has('id'),false);assert.ok(f.calls[0].searchParams.get('forHandle').startsWith('@'));assert.equal(f.calls[1].searchParams.get('channelId'),canonical);
 }
});
test('unsupported or malformed identifiers fail without requests',async()=>{
 for(const input of ['', 'mailto:synthetic@example.invalid','synthetic@example.invalid','@','@has space','@one@two','UC'+'!'.repeat(22),'https://example.invalid/channel/'+canonical,'https://youtube.com.evil.invalid/@test','https://youtube.com/channel/'+canonical+'/extra','https://youtube.com/@%ZZ','https://youtube.com/user/legacy']){
  const f=fixture();assert.equal(f.api.validateYouTubeChannelId(input).valid,false);await f.api.evaluateYouTubeChannel(key,input,'2026-10');assert.equal(f.calls.length,0);
 }
});
test('lookup failures never reach search and never log provider bodies or exception details',async()=>{
 for(const response of [reply({},false),reply({items:[]}),reply({items:[{statistics:{}}]}),reply({items:[{id:canonical}]}),{ok:true,json:async()=>{throw Error(marker)}},new Error(marker)]){
  const f=fixture([response]),result=await f.api.evaluateYouTubeChannel(key,'@'+marker,'2026-10');assert.ok(result.error);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(f.logs).includes(marker),false);assert.equal(JSON.stringify(result).includes(marker),false);
 }
});
test('evaluation/search/videos diagnostics omit identifiers, credentials and provider text',async()=>{
 const f=fixture([stats(),reply({},false)]);await f.api.evaluateYouTubeChannel(key,'@'+marker,'2026-10');assert.equal(JSON.stringify(f.logs).includes(marker),false);
 const g=fixture([reply({items:[{id:{videoId:'synthetic-video'}}]}),reply({},false)]);await g.api.fetchRecentVideos(key,canonical);assert.equal(JSON.stringify(g.logs).includes(marker),false);
 const h=fixture([stats(),new Error(marker)]),result=await h.api.evaluateYouTubeChannel(key,'@'+marker,'2026-10');assert.ok(result.error);assert.equal(JSON.stringify(h.logs).includes(marker),false);assert.equal(JSON.stringify(result).includes(marker),false);
});
