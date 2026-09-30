import ts from 'typescript';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
fs.mkdirSync('.sites-runtime/tests',{recursive:true});
for(const name of ['game','arena']){
 const source=fs.readFileSync(`lib/${name}.ts`,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("from './game'","from './game.mjs'");
 fs.writeFileSync(`.sites-runtime/tests/${name}.mjs`,js);
}
const {randomFleet,validFleet,newGame,shoot,expire,surrender,botTarget,excluded,restoreGame,canPlace,cellsAt}=await import(pathToFileURL(path.resolve('.sites-runtime/tests/game.mjs')));
const {createRoom,act,advance,publicRoom}=await import(pathToFileURL(path.resolve('.sites-runtime/tests/arena.mjs')));
let count=0;function test(name,fn){try{fn();count++;console.log('PASS',name)}catch(e){console.error('FAIL',name);throw e}}
test('250 valid randomized fleets',()=>{for(let i=0;i<250;i++)assert.ok(validFleet(randomFleet()))});
test('reject overlaps, diagonal contact, bent ships, missing ships, out of bounds',()=>{
 assert.equal(canPlace([[0]],[11]),false);assert.deepEqual(cellsAt(9,2,false),[]);assert.equal(validFleet([]),false);
 const f=randomFleet();f[0]=[0,1,11,12];assert.equal(validFleet(f),false);f[0]=[100,101,102,103];assert.equal(validFleet(f),false);
});
test('repeat shots do not mutate state; hit retains turn; last ship finishes',()=>{
 const g=newGame(randomFleet(),1,100);g.turn=0;const cell=g.boards[1].ships[0][0];shoot(g,0,cell,101);assert.equal(g.turn,0);const before=JSON.stringify(g);assert.throws(()=>shoot(g,0,cell,102));assert.equal(JSON.stringify(g),before);
 for(const c of g.boards[1].ships.flat().filter(c=>c!==cell))shoot(g,0,c,103);assert.equal(g.phase,'finished');assert.equal(g.winner,0);assert.throws(()=>shoot(g,0,90,104));
});
test('timeout and surrender',()=>{const g=newGame(randomFleet(),1,100);const turn=g.turn;assert.ok(!expire(g,60099));assert.ok(expire(g,60100));assert.equal(g.turn,1-turn);surrender(g,g.turn);assert.equal(g.winner,turn)});
test('all three bots complete 30 games without invalid or repeated shots',()=>{
 for(let difficulty=0;difficulty<3;difficulty++)for(let n=0;n<10;n++){
 const g=newGame(randomFleet(),difficulty,0);let moves=0;while(g.phase==='battle'){
  const p=g.turn,c=botTarget(g.boards[1-p].shots,difficulty);assert.ok(Number.isInteger(c));assert.ok(!excluded(g.boards[1-p].shots).has(c));shoot(g,p,c,++moves);assert.ok(moves<=200);
 }assert.ok([0,1].includes(g.winner));}
});
test('restoration validates fleet and shots',()=>{const g=newGame(randomFleet());assert.ok(restoreGame(JSON.parse(JSON.stringify(g))));g.boards[0].ships=[];assert.equal(restoreGame(g),null)});
function match(){const a={rooms:[]};const r=act(a,'p1','One',{action:'create'},1000,'room');act(a,'p2','Two',{action:'join',room:r.id},1001,'unused');act(a,'p1','One',{action:'ready',ships:randomFleet()},1002,'unused');act(a,'p2','Two',{action:'ready',ships:randomFleet()},1003,'unused');return {a,r};}
test('rooms hide the opponent fleet and reject third player',()=>{const {a,r}=match();assert.deepEqual(publicRoom(r,'p1',1004).game.boards[1].ships,[]);assert.ok(publicRoom(r,'p1',1004).game.boards[0].ships.length===10);assert.throws(()=>act(a,'p3','Three',{action:'join',room:r.id},1004,'unused'));assert.throws(()=>publicRoom(r,'stranger',1004));});
test('server enforces turn/version and deduplicates command',()=>{const {a,r}=match();const p=r.game.turn,user=r.players[p].id,cell=r.game.boards[1-p].ships[0][0],version=r.game.version;
 assert.throws(()=>act(a,r.players[1-p].id,'X',{action:'shot',room:r.id,cell,version,request:'wrong'},1004,'u'));
 const body={action:'shot',room:r.id,cell,version,request:'unique'};act(a,user,'X',body,1005,'u');const shots=r.game.boards[1-p].shots.length;act(a,user,'X',body,1006,'u');assert.equal(r.game.boards[1-p].shots.length,shots);
});
test('matchmaking pairs users once and cancellation closes room',()=>{const a={rooms:[]};const r=act(a,'p1','One',{action:'search'},1,'a');assert.equal(act(a,'p2','Two',{action:'search'},2,'b').id,r.id);assert.equal(act(a,'p1','One',{action:'search'},3,'c').id,r.id);assert.equal(a.rooms.length,1);act(a,'p1','One',{action:'leave'},4,'d');assert.equal(r.game.reason,'cancelled');});
test('disconnect pauses remaining time and reconnect restores it',()=>{const {a,r}=match();r.players[0].seen=1000;r.players[1].seen=14000;advance(r,14000);assert.ok(r.pause);const remaining=r.pause.remaining;act(a,'p1','One',{action:'poll',room:r.id},15000,'u');assert.equal(r.pause,undefined);assert.equal(r.game.deadline,15000+remaining)});
test('60-second reconnection deadline awards only connected opponent',()=>{const {r}=match();r.players[0].seen=1000;r.players[1].seen=73000;advance(r,73000);assert.equal(r.game.phase,'finished');assert.equal(r.game.winner,1);assert.equal(r.game.reason,'disconnect')});
test('both disconnected causes no winner',()=>{const {r}=match();r.players.forEach(p=>p.seen=1000);advance(r,74000);assert.equal(r.game.phase,'finished');assert.equal(r.game.winner,null)});
test('turn timeout advances server clock by absolute deadlines',()=>{const {r}=match();const turn=r.game.turn;r.players.forEach(p=>p.seen=61003);advance(r,61003);assert.equal(r.game.turn,1-turn);assert.equal(r.game.deadline,121003)});
test('rematch requires both players and creates a fresh room',()=>{const {a,r}=match();act(a,'p1','One',{action:'surrender',room:r.id},1004,'u');assert.equal(act(a,'p1','One',{action:'rematch',room:r.id},1005,'next').id,r.id);const next=act(a,'p2','Two',{action:'rematch',room:r.id},1006,'next');assert.equal(next.id,'next');assert.equal(next.game.phase,'setup');assert.ok(next.players.every(p=>!p.ready));});
console.log(`${count} checks passed`);
