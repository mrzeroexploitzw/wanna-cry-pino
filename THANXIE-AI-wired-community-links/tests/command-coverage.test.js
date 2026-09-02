import test from 'node:test';
import assert from 'node:assert/strict';
import { commandRegistry } from '../src/commands/registry.js';
import { executeCommand } from '../src/services/commands/commandService.js';

const user={whatsapp_id:process.env.OWNER_WHATSAPP_ID||'owner-test',registration_status:'registered',premium_status:1,premium_expiry:null,language:'en',slang_enabled:1,slang_style:'ghana-naija-pidgin',display_name:'THANXIE DEV'};
const originalFetch=global.fetch;
global.fetch=async (url)=>({ok:true,json:async()=>({results:[{name:'Harare',country:'Zimbabwe',latitude:-17.8,longitude:31.0}],current:{temperature_2m:25,relative_humidity_2m:50,wind_speed_10m:10},rates:{EUR:0.9},meanings:[{partOfSpeech:'noun',definitions:[{definition:'test'}]}]}),headers:new Map([['content-type','application/json']])});

test('every registered command has a live handler path', async()=>{
  assert.equal(commandRegistry.length,185);
  for(const meta of commandRegistry){
    const sampleArgs = meta.name === '.setrules' ? ['Respect everyone'] : meta.name === '.badword' ? ['add','exampleword'] : meta.name === '.setbotimage' ? [] : ['test'];
    const result=await executeCommand({command:meta.name,args:sampleArgs,from:user.whatsapp_id,user,groupId:'test-group',isAdmin:true,media:null});
    assert.ok(result && typeof result==='object',`${meta.name} returned no result`);
    assert.ok(typeof result.text==='string' || result.mediaOutput,`${meta.name} returned neither text nor media output`);
  }
});

test.after(()=>{global.fetch=originalFetch;});
