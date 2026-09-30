import {type Game,type Ship,TURN_MS,shoot,validFleet,surrender} from './game';
export type Player={id:string;name:string;seen:number;ready:boolean;rematch:boolean};
export type Room={id:string;public:boolean;players:Player[];game:Game;created:number;finished?:number;pause?:{at:number;remaining:number};next?:string;requests:string[]};
export type Arena={rooms:Room[]};
export const DISCONNECT_MS=12_000,RECONNECT_MS=60_000;
export function createRoom(id:string,user:string,name:string,publicRoom:boolean,now:number):Room{
 return {id,public:publicRoom,players:[{id:user,name,seen:now,ready:false,rematch:false}],created:now,requests:[],game:{id,boards:[{ships:[],shots:[]},{ships:[],shots:[]}],turn:0,phase:'setup',winner:null,reason:'',deadline:0,difficulty:0,version:1}};
}
function finish(r:Room,winner:number|null,reason:string,now:number){r.game.phase='finished';r.game.winner=winner;r.game.reason=reason;r.finished=now;r.game.version++;delete r.pause;}
export function advance(r:Room,now:number){
 if(r.game.phase!=='battle')return;
 const offline=r.players.map(p=>now>=p.seen+DISCONNECT_MS);
 if(offline.some(Boolean)){
   const since=Math.min(...r.players.filter((_,i)=>offline[i]).map(p=>p.seen+DISCONNECT_MS));
   if(!r.pause){
     if(r.game.deadline<=since){const n=Math.floor((since-r.game.deadline)/TURN_MS)+1;r.game.turn=(r.game.turn+n)%2;r.game.deadline+=n*TURN_MS;}
     r.pause={at:since,remaining:Math.max(0,r.game.deadline-since)};
   }
   if(offline.every(Boolean)&&now>=Math.max(...r.players.map(p=>p.seen+DISCONNECT_MS+RECONNECT_MS)))finish(r,null,'abandoned',now);
   else if(offline.filter(Boolean).length===1){const absent=offline[0]?0:1;if(now>=r.players[absent].seen+DISCONNECT_MS+RECONNECT_MS)finish(r,1-absent,'disconnect',now);}
 }else if(r.pause){r.game.deadline=now+r.pause.remaining;delete r.pause;}
 if(r.game.phase==='battle'&&!r.pause&&now>=r.game.deadline){const n=Math.floor((now-r.game.deadline)/TURN_MS)+1;r.game.turn=(r.game.turn+n)%2;r.game.deadline+=n*TURN_MS;r.game.version++;}
}
export function act(arena:Arena,user:string,name:string,body:any,now:number,newId:string){
 const action=body.action??'poll';
 let own=arena.rooms.find(r=>r.players.some(p=>p.id===user)&&r.game.phase!=='finished');
 if(!own&&body.room)own=arena.rooms.find(r=>r.id===body.room&&r.players.some(p=>p.id===user));
 // Settle elapsed deadlines before treating a returning visitor as connected.
 for(const r of arena.rooms)advance(r,now);
 if(own){const p=own.players.find(p=>p.id===user)!;if(now-p.seen>=3000)p.seen=now;advance(own,now);}
 if(action==='create'||action==='search'){
   if(own&&own.game.phase!=='finished')return own;
   if(action==='search'){
     const waiting=arena.rooms.find(r=>r.public&&r.game.phase==='setup'&&r.players.length===1&&r.players[0].id!==user&&now-r.players[0].seen<DISCONNECT_MS);
     if(waiting){waiting.players.push({id:user,name,seen:now,ready:false,rematch:false});return waiting;}
   }
   if(arena.rooms.filter(r=>r.game.phase!=='finished').length>=100)throw Error('busy');
   const r=createRoom(newId,user,name,action==='search',now);arena.rooms.push(r);return r;
 }
 if(action==='join'){
   if(own&&own.game.phase!=='finished'){if(own.id!==body.room)throw Error('active');return own;}
   const r=arena.rooms.find(r=>r.id===body.room);if(!r)throw Error('notFound');
   if(r.game.phase!=='setup'||r.players.length>=2)throw Error('full');
   r.players.push({id:user,name,seen:now,ready:false,rematch:false});return r;
 }
 if(!own)return null;
 const r=own,me=r.players.findIndex(p=>p.id===user);
 if(action==='leave'&&r.game.phase==='setup'){
   // Cancel both places rather than leave a half-ready orphan match.
   finish(r,null,'cancelled',now);return null;
 }
 if(action==='ready'){
   if(r.game.phase!=='setup')return r;
   if(!validFleet(body.ships))throw Error('placement');
   if(!r.players[me].ready){r.game.boards[me].ships=body.ships as Ship[];r.players[me].ready=true;}
   if(r.players.length===2&&r.players.every(p=>p.ready)){
     r.game.phase='battle';r.game.turn=Math.random()<.5?0:1;r.game.deadline=now+TURN_MS;r.game.version++;
   }
 }
 if(action==='shot'){
   if(typeof body.request!=='string'||body.request.length>80)throw Error('invalid');
   if(r.requests.includes(body.request))return r;
   if(r.pause)throw Error('paused');
   if(body.version!==r.game.version)throw Error('stale');
   shoot(r.game,me,body.cell,now);r.requests.push(body.request);r.requests=r.requests.slice(-220);
   if(r.game.phase==='finished')r.finished=now;
 }
 if(action==='surrender'){surrender(r.game,me);if(r.game.phase==='finished')r.finished=now;delete r.pause;}
 if(action==='rematch'&&r.game.phase==='finished'){
   if(r.next)return arena.rooms.find(x=>x.id===r.next)??r;
   if(r.players.length!==2)throw Error('notFound');
   r.players[me].rematch=true;
   if(r.players.every(p=>p.rematch)){
     if(r.players.some(p=>arena.rooms.some(x=>x.id!==r.id&&x.game.phase!=='finished'&&x.players.some(q=>q.id===p.id))))throw Error('active');
     const next=createRoom(newId,r.players[0].id,r.players[0].name,false,now);next.players.push({...r.players[1],seen:now,ready:false,rematch:false});arena.rooms.push(next);r.next=next.id;return next;
   }
 }
 if(r.next)return arena.rooms.find(x=>x.id===r.next)??r;
 return r;
}
export function publicRoom(r:Room|null,user:string,now:number){
 if(!r)return null;
 const me=r.players.findIndex(p=>p.id===user);if(me<0)throw Error('forbidden');
 return {id:r.id,public:r.public,me,players:r.players.map(p=>({name:p.name,ready:p.ready,rematch:p.rematch,online:now<p.seen+DISCONNECT_MS})),pause:r.pause?{until:Math.min(...r.players.filter(p=>now>=p.seen+DISCONNECT_MS).map(p=>p.seen+DISCONNECT_MS+RECONNECT_MS))}:null,
   game:{...r.game,boards:r.game.boards.map((b,i)=>({shots:b.shots,ships:i===me||r.game.phase==='finished'?b.ships:[]}))},next:r.next};
}
