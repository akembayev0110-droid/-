import {env} from 'cloudflare:workers';
import {act,publicRoom,type Arena} from '@/lib/arena';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200,cookie?:string)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function POST(req:Request){
 try{
   const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'forbidden'},403);
   const raw=await req.text();if(raw.length>12000)return json({error:'invalid'},400);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid'},400)}
   if(!body||typeof body!=='object')return json({error:'invalid'},400);
   if(!env.DB)return json({error:'unavailable'},503);
   let token=req.headers.get('cookie')?.match(/(?:^|;\s*)harbor_guest=([a-f0-9]{64})(?:;|$)/)?.[1];
   if(!token)token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const user=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const cookie=`harbor_guest=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(req.url).protocol==='https:'?'; Secure':''}`;
   const name=(typeof body.name==='string'?body.name:'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24)||'Captain';
   const id=crypto.randomUUID().replaceAll('-','').slice(0,16);
   await env.DB.batch([
     env.DB.prepare('CREATE TABLE IF NOT EXISTS arena (id INTEGER PRIMARY KEY NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL)'),
     env.DB.prepare('CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY NOT NULL, winner TEXT, loser TEXT, finished INTEGER NOT NULL)'),
     env.DB.prepare('CREATE INDEX IF NOT EXISTS results_winner_idx ON results (winner)'),
     env.DB.prepare('CREATE INDEX IF NOT EXISTS results_loser_idx ON results (loser)'),
   ]);
   await env.DB.prepare('INSERT OR IGNORE INTO arena (id,version,data) VALUES (1,0,?)').bind('{"rooms":[]}').run();
   for(let attempt=0;attempt<10;attempt++){
     const row=await env.DB.prepare('SELECT version,data FROM arena WHERE id=1').first<{version:number;data:string}>();
     if(!row)throw Error('unavailable');
     const arena:Arena=JSON.parse(row.data),now=Date.now();
     let room,error:string|undefined;
     try{room=act(arena,user,name,body,now,id)}catch(e){error=(e as Error).message;room=arena.rooms.find(r=>r.id===body.room&&r.players.some(p=>p.id===user))??null;}
     const serialized=JSON.stringify(arena);
     if(serialized!==row.data){const saved=await env.DB.prepare('UPDATE arena SET data=?,version=version+1 WHERE id=1 AND version=?').bind(serialized,row.version).run();if(!saved.meta.changes){await new Promise(r=>setTimeout(r,20+Math.random()*60));continue;}}
     const finished=arena.rooms.filter(r=>r.game.phase==='finished'&&r.players.length===2&&r.game.winner!==null);
     if(finished.length)await env.DB.batch(finished.map(r=>env.DB!.prepare('INSERT OR IGNORE INTO results (id,winner,loser,finished) VALUES (?,?,?,?)').bind(r.id,r.players[r.game.winner!].id,r.players[1-r.game.winner!].id,r.finished??now)));
     const stats=await env.DB.prepare('SELECT COALESCE(SUM(winner=?),0) AS wins,COALESCE(SUM(loser=?),0) AS losses FROM results WHERE winner=? OR loser=?').bind(user,user,user,user).first();
     // Finished records have been durably recorded before bounded cleanup.
     const trim=arena.rooms.filter(r=>!(r.finished&&now-r.finished>3600000)&&!(r.game.phase==='setup'&&r.players.every(p=>now-p.seen>600000)));
     if(trim.length!==arena.rooms.length)await env.DB.prepare('UPDATE arena SET data=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify({rooms:trim}),row.version+(serialized!==row.data?1:0)).run();
     return json({room:publicRoom(room??null,user,now),stats,now,...(error?{error}:{})},error?409:200,cookie);
   }
   return json({error:'busy'},503,cookie);
 }catch(e){console.error('game-api',e instanceof Error?e.message:'error');return json({error:'unavailable'},503);}
}
