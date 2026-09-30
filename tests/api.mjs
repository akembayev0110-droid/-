import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {randomFleet}=await import(pathToFileURL(path.resolve('.sites-runtime/tests/game.mjs')));
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
function guest(name){let cookie='',room;return async(action,extra={})=>{const res=await fetch(origin+'/api/game',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({action,name,room,...extra})});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];const data=await res.json();if(data.room)room=data.room.id;return {...data,status:res.status};};}
const a=guest('QA One'),b=guest('QA Two'),c=guest('QA Third');
let ra=await a('create');assert.equal(ra.status,200,JSON.stringify(ra));const id=ra.room.id;console.log('PASS create guest room');
let rb=await b('join',{room:id});assert.equal(rb.room.players.length,2);assert.equal((await c('join',{room:id})).error,'full');console.log('PASS guest join and third-player rejection');
const fa=randomFleet(),fb=randomFleet();await a('ready',{ships:fa});rb=await b('ready',{ships:fb});ra=await a('poll');assert.equal(ra.room.game.phase,'battle');assert.deepEqual(ra.room.game.boards[1].ships,[]);assert.deepEqual(rb.room.game.boards[0].ships,[]);console.log('PASS ready handshake and hidden fleets');
const turn=ra.room.game.turn,actor=turn===0?a:b,other=turn===0?b:a,enemy=turn===0?fb:fa;
const request=crypto.randomUUID(),version=ra.room.game.version,cell=enemy[0][0];
const hit=await actor('shot',{cell,version,request});assert.equal(hit.status,200,JSON.stringify(hit));assert.equal(hit.room.game.boards[1-turn].shots.length,1);
const duplicate=await actor('shot',{cell,version,request});assert.equal(duplicate.room.game.boards[1-turn].shots.length,1);console.log('PASS idempotent move');
const wrong=await other('shot',{cell:50,version:hit.room.game.version,request:crypto.randomUUID()});assert.equal(wrong.error,'notTurn');
let state=duplicate;
for(const target of enemy.flat().filter(x=>x!==cell)){state=await actor('shot',{cell:target,version:state.room.game.version,request:crypto.randomUUID()});assert.equal(state.status,200,JSON.stringify(state));}
assert.equal(state.room.game.phase,'finished');assert.equal(state.room.game.winner,turn);assert.equal(state.stats.wins,1);assert.equal((await actor('poll')).stats.wins,1);assert.equal((await other('poll')).stats.losses,1);console.log('PASS full network game, revealed fleets and exactly-once statistics');
await a('rematch');const next=await b('rematch');assert.notEqual(next.room.id,id);assert.equal((await a('poll')).room.id,next.room.id);await a('leave');console.log('PASS mutual rematch');
const d=guest('QA Search One'),e=guest('QA Search Two'),f=guest('QA Search Three'),g=guest('QA Search Four');
const pairs=await Promise.all([d('search'),e('search'),f('search'),g('search')]);pairs.forEach(p=>assert.equal(p.status,200,JSON.stringify(p)));const ids=pairs.map(p=>p.room.id);assert.equal(new Set(ids).size,2);console.log('PASS concurrent matchmaking');
await Promise.all([d('leave'),e('leave'),f('leave'),g('leave')]);
const badOrigin=await fetch(origin+'/api/game',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{"action":"create"}'});assert.equal(badOrigin.status,403);console.log('PASS origin protection');
console.log('All API scenarios passed');
