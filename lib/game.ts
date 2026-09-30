export const FLEET = [4,3,3,2,2,2,1,1,1,1];
export const TURN_MS = 60_000;
export type Ship = number[];
export type Shot = { cell:number; hit:boolean; sunk?:number[] };
export type Board = { ships:Ship[]; shots:Shot[] };
export type Game = { id:string; boards:[Board,Board]; turn:number; phase:'setup'|'battle'|'finished'; winner:number|null; reason:string; deadline:number; difficulty:number; version:number };
export const neighbors=(c:number)=>Array.from({length:9},(_,i)=>[Math.floor(c/10)+Math.floor(i/3)-1,c%10+i%3-1]).filter(([r,c])=>r>=0&&r<10&&c>=0&&c<10).map(([r,c])=>r*10+c);
export function cellsAt(start:number,length:number,vertical:boolean):number[]{
  const row=Math.floor(start/10),col=start%10;
  if(!Number.isInteger(start)||start<0||start>99||length<1||length>4||(vertical?row:col)+length>10)return [];
  return Array.from({length},(_,i)=>start+i*(vertical?10:1));
}
export function canPlace(ships:Ship[],cells:number[]){
  if(!cells.length||cells.some(c=>!Number.isInteger(c)||c<0||c>=100))return false;
  const occupied=new Set(ships.flatMap(s=>s.flatMap(neighbors)));
  return cells.every(c=>!occupied.has(c));
}
export function validFleet(ships:unknown):ships is Ship[]{
  if(!Array.isArray(ships)||ships.length!==10||ships.some(s=>!Array.isArray(s)))return false;
  if(ships.map(s=>s.length).sort((a,b)=>b-a).join()!==FLEET.join())return false;
  const prior:Ship[]=[];
  for(const raw of ships){
    const s=[...raw].sort((a,b)=>a-b);
    if(new Set(s).size!==s.length||!canPlace(prior,s))return false;
    const h=cellsAt(s[0],s.length,false),v=cellsAt(s[0],s.length,true);
    if(s.join()!==h.join()&&s.join()!==v.join())return false;
    prior.push(s);
  }return true;
}
export function randomFleet(random= Math.random):Ship[]{
  function fill(ships:Ship[],depth:number):Ship[]|null{
    if(depth===FLEET.length)return ships;
    const candidates=Array.from({length:200},(_,i)=>i);
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    for(const n of candidates){const cells=cellsAt(n%100,FLEET[depth],n>=100);if(canPlace(ships,cells)){const found=fill([...ships,cells],depth+1);if(found)return found;}}
    return null;
  }return fill([],0)!;
}
export function newGame(ships:Ship[],difficulty=1,now=Date.now()):Game{
  return {id:crypto.randomUUID(),boards:[{ships,shots:[]},{ships:randomFleet(),shots:[]}],turn:Math.random()<.5?0:1,phase:'battle',winner:null,reason:'',deadline:now+TURN_MS,difficulty,version:1};
}
export function excluded(shots:Shot[]){return new Set(shots.flatMap(s=>s.sunk?s.sunk.flatMap(neighbors):[s.cell]));}
export function shoot(game:Game,player:number,cell:number,now=Date.now()):Shot{
  if(game.phase!=='battle'||game.turn!==player||now>=game.deadline)throw Error('notTurn');
  if(!Number.isInteger(cell)||cell<0||cell>=100)throw Error('invalid');
  const target=game.boards[1-player];
  if(excluded(target.shots).has(cell))throw Error('already');
  const ship=target.ships.find(s=>s.includes(cell));
  const shot:Shot={cell,hit:!!ship};
  target.shots.push(shot);
  if(ship&&ship.every(c=>target.shots.some(s=>s.cell===c)))shot.sunk=[...ship];
  if(target.ships.every(s=>s.every(c=>target.shots.some(h=>h.cell===c)))){
    game.phase='finished';game.winner=player;game.reason='fleet';
  }else if(!ship)game.turn=1-player;
  game.deadline=now+TURN_MS;game.version++;return shot;
}
export function expire(game:Game,now=Date.now()){
  if(game.phase==='battle'&&now>=game.deadline){game.turn=1-game.turn;game.deadline=now+TURN_MS;game.version++;return true;}return false;
}
export function surrender(game:Game,player:number){if(game.phase!=='battle')return;game.phase='finished';game.winner=1-player;game.reason='surrender';game.version++;}
// This API deliberately accepts observations, never the target fleet.
export function botTarget(shots:Shot[],difficulty:number,random=Math.random):number{
  const blocked=excluded(shots),available=Array.from({length:100},(_,i)=>i).filter(c=>!blocked.has(c));
  const pick=(a:number[])=>a[Math.floor(random()*a.length)];
  if(difficulty===0)return pick(available);
  const sunk=new Set(shots.flatMap(s=>s.sunk??[]));
  const hits=shots.filter(s=>s.hit&&!sunk.has(s.cell)).map(s=>s.cell);
  const adjacent=available.filter(c=>hits.some(h=>(Math.abs(c-h)===10)||(Math.floor(c/10)===Math.floor(h/10)&&Math.abs(c-h)===1)));
  if(difficulty===1){
    const linear=adjacent.filter(c=>hits.some(a=>hits.some(b=>a!==b&&((a%10===b%10&&c%10===a%10)||(Math.floor(a/10)===Math.floor(b/10)&&Math.floor(c/10)===Math.floor(a/10))))));
    return pick(linear.length?linear:adjacent.length?adjacent:available);
  }
  const remaining=[...FLEET];for(const s of shots)if(s.sunk){const i=remaining.indexOf(s.sunk.length);if(i>=0)remaining.splice(i,1);}
  const miss=new Set(shots.filter(s=>!s.hit).map(s=>s.cell));
  const impossible=new Set(shots.flatMap(s=>s.sunk?s.sunk.flatMap(neighbors):[]));
  const scores=Array(100).fill(0);
  for(const len of remaining)for(let c=0;c<100;c++)for(const vertical of [false,true]){
    const cells=cellsAt(c,len,vertical);if(cells.length!==len||cells.some(x=>miss.has(x)||impossible.has(x)))continue;
    const count=cells.filter(x=>hits.includes(x)).length;
    if(hits.length&&!count)continue;
    for(const x of cells)if(!blocked.has(x))scores[x]+=count?20*count:1;
  }
  const max=Math.max(...available.map(c=>scores[c]));return pick(available.filter(c=>scores[c]===max));
}
export function restoreGame(raw:unknown):Game|null{
  try{const g=raw as Game;if(!g||!['battle','finished'].includes(g.phase)||!g.id||![0,1].includes(g.turn)||![0,1,2].includes(g.difficulty)||!Number.isFinite(g.deadline)||!Array.isArray(g.boards)||g.boards.length!==2)return null;
    for(const b of g.boards){if(!validFleet(b.ships)||!Array.isArray(b.shots)||new Set(b.shots.map(s=>s.cell)).size!==b.shots.length)return null;for(const s of b.shots)if(!Number.isInteger(s.cell)||s.cell<0||s.cell>99||s.hit!==b.ships.some(ship=>ship.includes(s.cell)))return null;}
    if(g.phase==='finished'&&![0,1].includes(g.winner!))return null;return g;
  }catch{return null;}
}
