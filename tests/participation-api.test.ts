import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { GET, POST } from '../api/participation';
import { MemoryCommunityStore } from '../server/community-memory';
import { coordinationRequest, participationSupport } from '../server/participation';
import { TestStore } from './helpers/test-store';
import { memberRecord } from './helpers/fixtures';
import type { ParticipationState } from '../shared/coordination';

let community: MemoryCommunityStore;
let board: TestStore;
vi.mock('../server/db',()=>({getStore:()=>board}));
vi.mock('../server/community-store',()=>({getCommunityStore:()=>community}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('includes existing star support without inflating confirmed feedback, leaking history or counting hidden and duplicate recipients',async()=>{
  const store=new TestStore();
  const now=Date.now();
  const star=(ownerLogin:string,repositoryId:string)=>({ownerLogin,repositoryId,starredAt:now-1000});
  const actor=memberRecord({login:'alice',displayLogin:'Alice',starredRepositories:[star('Bob','R_bob'),star('bOb','R_bob_second'),star('Alice','R_self'),star('Hidden','R_hidden'),star('Outside','R_outside')],starSupportUpdatedAt:now});
  await store.createMember(actor);
  await store.createMember(memberRecord({githubId:2,login:'bob',whatsapp:'+15550000002',nickname:'Bob'}));
  await store.createMember(memberRecord({githubId:3,login:'hidden',hidden:true,whatsapp:'+15550000003',nickname:'Hidden'}));
  const state={activity:{linked:true,contributions:0},projects:[],help:[],contributions:[]} as unknown as ParticipationState;
  const supported=await participationSupport(state,store,{id:1,login:'Alice'});
  expect(supported.activity).toMatchObject({contributions:0,starSupport:{members:1,points:20,updatedAt:now}});
  expect(supported.contributions).toEqual([]);
  expect(JSON.stringify(supported)).not.toMatch(/R_bob|starredRepositories|15550000002|R_hidden/);
  expect(state.activity.starSupport).toBeUndefined();
  await store.patchMember('alice',{starredRepositories:[]});
  expect((await participationSupport(state,store,{id:1,login:'Alice'})).activity.starSupport).toEqual({members:0,points:0,updatedAt:now});
  for(const patch of [{githubId:99},{githubId:1,starHistoryVersion:1},{starHistoryVersion:2,starSupportUpdatedAt:undefined}]){
    await store.patchMember('alice',patch);
    expect((await participationSupport(state,store,{id:1,login:'Alice'})).activity.starSupport).toEqual({members:null,points:null,updatedAt:null});
  }
  expect((await participationSupport(state,store,{id:55,login:'Missing'})).activity.starSupport).toEqual({members:null,points:null,updatedAt:null});
});

it('accepts only a bot WhatsApp link containing the issued command, while allowing older bot responses',async()=>{
  vi.stubEnv('WHATSAPP_MEMBERSHIP_URL','https://bot.example.test/api/v1/membership');
  vi.stubEnv('WHATSAPP_MEMBERSHIP_TOKEN','t'.repeat(40));
  const challenge={id:'link_1',code:'ABC123',expiresAt:Date.now()+600_000};
  const good='https://wa.me/15550000000?text=%2Flink%20ABC123';
  let payload:unknown={...challenge,botChatUrl:good};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}})));
  expect(await coordinationRequest('link',{})).toEqual(payload);
  payload=challenge;
  expect(await coordinationRequest('link',{})).toEqual(challenge);
  for(const botChatUrl of [42,'javascript:alert(1)','https://wa.me.evil.test/15550000000?text=%2Flink%20ABC123','https://user:pass@wa.me/15550000000?text=%2Flink%20ABC123','https://wa.me/15550000000?text=%2Flink%20OTHER','https://wa.me/15550000000?text=%2Flink%20ABC123&other=1','https://wa.me/15550000000?text=%2Flink%20ABC123#other']) {
    payload={...challenge,botChatUrl};
    await expect(coordinationRequest('link',{})).rejects.toMatchObject({status:503});
  }
});

it('uses the signed-in GitHub identity through HTTP and protects personal responses, origin and outages',async()=>{
  community=new MemoryCommunityStore(null); board=new TestStore();
  vi.stubEnv('GITHUB_OAUTH_CLIENT_ID','test-client');vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET','test-secret');vi.stubEnv('GITHUB_OAUTH_REDIRECT_URI','https://opencircle.test/api/auth-callback');
  const token='a'.repeat(64);
  await community.createSession(createHash('sha256').update(token).digest('hex'),{id:1,login:'Alice',avatarUrl:''},Date.now()+60_000);
  await board.createMember(memberRecord({login:'alice',displayLogin:'Alice',starredRepositories:[{repositoryId:'R_bob',ownerLogin:'Bob',starredAt:Date.now()-1000}]}));
  await board.createMember(memberRecord({githubId:2,login:'bob',whatsapp:'+15550000002',nickname:'Bob'}));
  const calls:{path:string;body:Record<string,unknown>}[]=[];
  let status=200;
  let payload:unknown={activity:{linked:false},projects:[],help:[],contributions:[]};
  const service=createServer(async(req,res)=>{
    expect(req.headers.authorization).toBe(`Bearer ${'t'.repeat(40)}`);
    const chunks:Buffer[]=[]; for await(const chunk of req) chunks.push(Buffer.from(chunk));
    calls.push({path:req.url!,body:JSON.parse(Buffer.concat(chunks).toString())});
    res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(payload));
  });
  await new Promise<void>(resolve=>service.listen(0,'127.0.0.1',resolve));
  const address=service.address(); if(!address||typeof address==='string') throw new Error('No service address');
  vi.stubEnv('WHATSAPP_MEMBERSHIP_URL',`http://127.0.0.1:${address.port}/api/v1/membership`);
  vi.stubEnv('WHATSAPP_MEMBERSHIP_TOKEN','t'.repeat(40));
  const request=(body?:unknown,origin='https://opencircle.test')=>new Request('https://opencircle.test/api/participation',{method:body===undefined?'GET':'POST',headers:{cookie:`opencircle_github=${token}`,origin,'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.40'},body:body===undefined?undefined:JSON.stringify(body)});
  try {
    expect((await GET(new Request('https://opencircle.test/api/participation'))).status).toBe(401);
    const own=await GET(request()); expect(own.status).toBe(200);expect(own.headers.get('cache-control')).toBe('private, no-store');
    expect(await own.json()).toMatchObject({activity:{starSupport:{members:1,points:20}}});
    payload={id:'link_1',code:'ABC123',expiresAt:Date.now()+600_000};
    const callsBeforeInvalidPhone=calls.length;
    const invalidPhone=await POST(request({action:'link',phone:'0803 123 4567'}));
    expect(invalidPhone.status).toBe(400);
    expect(await invalidPhone.json()).toMatchObject({error:{code:'invalid_whatsapp',message:expect.stringContaining('country code')}});
    expect(calls).toHaveLength(callsBeforeInvalidPhone);
    expect((await POST(request({action:'link',phone:'+234 803 123 4567',login:'Other'}))).status).toBe(201);
    expect(calls.at(-1)).toEqual({path:'/api/v1/coordination/link',body:{login:'Alice',phone:'+2348031234567'}});
    expect((await POST(request({action:'link',phone:'bad'}))).status).toBe(400);
    expect((await POST(request({action:'help',question:'A question'},'https://foreign.test'))).status).toBe(403);
    payload={activity:{linked:true},projects:[],help:[],contributions:[]};
    expect((await POST(request({action:'help',question:'How can I improve this?',login:'Other'}))).status).toBe(409);
    const answered=await POST(request({action:'answer',helpId:'existing',text:'A useful existing answer',login:'Other'}));
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({activity:{starSupport:{members:1,points:20}}});
    expect(calls.at(-1)?.body.login).toBe('Alice');
    status=409;payload={error:'Already reviewed.'};
    await expect(coordinationRequest('action',{})).rejects.toMatchObject({status:409,message:'Already reviewed.'});
    status=401;payload={error:'private service token detail'};
    const unavailable=await GET(request());expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain('private service token');
    status=200;payload={activity:{linked:true},projects:[],help:[],contributions:[],community:{updates:'invalid'}};
    await expect(coordinationRequest('profile',{})).rejects.toMatchObject({status:503});
    payload={activity:{linked:true},projects:[],help:[],contributions:[],community:{timezone:'invalid',quietStart:22,quietEnd:8,groupSchedule:false,updates:[],sessions:[],mentor:{available:false,skills:[],weeklyLimit:2},assignedHelp:[]}};
    await expect(coordinationRequest('profile',{})).rejects.toMatchObject({status:503});
    status=200;payload={unexpected:true};
    await expect(coordinationRequest('profile',{})).rejects.toMatchObject({status:503});
    vi.stubEnv('NODE_ENV','production');
    await expect(coordinationRequest('profile',{})).rejects.toMatchObject({status:503});
  } finally {await new Promise<void>((resolve,reject)=>service.close(error=>error?reject(error):resolve()));}
});

it('returns from OAuth to participation and rejects arbitrary return destinations',async()=>{
  vi.stubEnv('GITHUB_OAUTH_CLIENT_ID','test-client');vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET','test-secret');vi.stubEnv('GITHUB_OAUTH_REDIRECT_URI','https://opencircle.test/api/auth-callback');
  const {beginGitHubSignIn,finishGitHubSignIn}=await import('../server/github-auth');
  const store=new MemoryCommunityStore(null);
  for(const returnTo of ['/participation','/participation#start','/participation#overview','/participation#repositories','/participation#catch-up','/participation#projects','/participation#help','/participation#feedback','https://foreign.test','//foreign.test/participation','/participation?next=https://foreign.test','/participation#unknown']) {
    const started=beginGitHubSignIn(new Request(`https://opencircle.test/api/auth-start?returnTo=${encodeURIComponent(returnTo)}`));
    const state=new URL(started.headers.get('location')!).searchParams.get('state');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'test',token_type:'bearer'}))).mockResolvedValueOnce(new Response(JSON.stringify({id:1,login:'Alice',type:'User'}))));
    const result=await finishGitHubSignIn(new Request(`https://opencircle.test/api/auth-callback?code=code&state=${state}`,{headers:{cookie:started.headers.get('set-cookie')!.split(';')[0]}}),store);
    expect(result.headers.get('location')).toBe(['/participation','/participation#start','/participation#overview','/participation#repositories','/participation#catch-up','/participation#projects','/participation#help','/participation#feedback'].includes(returnTo)?returnTo:'/tools');
  }
});

it('keeps an allowed participation tab after cancelled sign-in with the error before the hash',async()=>{
  vi.stubEnv('GITHUB_OAUTH_CLIENT_ID','test-client');vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET','test-secret');vi.stubEnv('GITHUB_OAUTH_REDIRECT_URI','https://opencircle.test/api/auth-callback');
  const {beginGitHubSignIn,finishGitHubSignIn}=await import('../server/github-auth');
  const store=new MemoryCommunityStore(null);
  const started=beginGitHubSignIn(new Request('https://opencircle.test/api/auth-start?returnTo=%2Fparticipation%23repositories'));
  const state=new URL(started.headers.get('location')!).searchParams.get('state');
  const result=await finishGitHubSignIn(new Request(`https://opencircle.test/api/auth-callback?error=access_denied&state=${state}`,{headers:{cookie:started.headers.get('set-cookie')!.split(';')[0]}}),store);
  expect(result.headers.get('location')).toBe('/participation?signin=github_denied#repositories');
});

it('accepts a still-valid participation sign-in started before tab destinations were introduced',async()=>{
  vi.stubEnv('GITHUB_OAUTH_CLIENT_ID','test-client');vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET','test-secret');vi.stubEnv('GITHUB_OAUTH_REDIRECT_URI','https://opencircle.test/api/auth-callback');
  const {beginGitHubSignIn,finishGitHubSignIn}=await import('../server/github-auth');
  const store=new MemoryCommunityStore(null);
  const started=beginGitHubSignIn(new Request('https://opencircle.test/api/auth-start?returnTo=%2Fparticipation'));
  const state=new URL(started.headers.get('location')!).searchParams.get('state');
  const original=started.headers.get('set-cookie')!.split(';')[0];
  const [name,value]=original.split('=');
  const saved=JSON.parse(Buffer.from(value.split('.')[0],'base64url').toString());saved.participation=true;
  const payload=Buffer.from(JSON.stringify(saved)).toString('base64url');
  const signature=createHmac('sha256','test-secret').update(payload).digest('base64url');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'test',token_type:'bearer'}))).mockResolvedValueOnce(new Response(JSON.stringify({id:1,login:'Alice',type:'User'}))));
  const result=await finishGitHubSignIn(new Request(`https://opencircle.test/api/auth-callback?code=code&state=${state}`,{headers:{cookie:`${name}=${payload}.${signature}`}}),store);
  expect(result.headers.get('location')).toBe('/participation');
});
