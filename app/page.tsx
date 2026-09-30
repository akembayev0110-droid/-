'use client';
import {useState,useEffect,useRef,useCallback} from 'react';
import {Anchor,ArrowLeft,Check,Copy,Flag,Globe2,Loader2,RefreshCw,RotateCw,Save,Shield,Shuffle,Swords,Timer,Users,X,Target,Monitor,HelpCircle} from 'lucide-react';
import {FLEET,randomFleet,cellsAt,canPlace,validFleet,newGame,shoot,expire,surrender,botTarget,excluded,restoreGame,type Ship,type Game,type Shot} from '@/lib/game';
import {dictionaries,type Lang,type Key} from '@/lib/i18n';

type Stats={wins:number;losses:number};
type Room={id:string;me:number;public:boolean;players:{name:string;ready:boolean;rematch:boolean;online:boolean}[];pause:{until:number}|null;game:Game;next?:string};
type View='home'|'setup'|'game';
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const LS='quiet-harbor-v1';
function Board({ships,shots=[],onCell,disabled=false,title,t}:{ships:Ship[];shots?:Shot[];onCell?:(c:number)=>void;disabled?:boolean;title:string;t:(k:Key)=>string}){
 const sunk=new Set(shots.flatMap(s=>s.sunk??[])),known=excluded(shots);
 return <div className="sea-board" role="group" aria-label={title}><span className="axis corner"/>{'ABCDEFGHIJ'.split('').map(c=><span className="axis" key={c}>{c}</span>)}
 {Array.from({length:10},(_,row)=><div className="board-row" key={row}><span className="axis">{row+1}</span>{Array.from({length:10},(_,col)=>{const cell=row*10+col,shot=shots.find(s=>s.cell===cell),ship=ships.some(s=>s.includes(cell)),dead=sunk.has(cell),mark=shot?.hit?'×':known.has(cell)?'·':'';
 return <button key={cell} className={`cell ${ship?'has-ship':''} ${shot?.hit?'hit':''} ${dead?'sunk':''} ${known.has(cell)&&!shot?.hit?'miss':''}`} disabled={disabled||(!onCell)||known.has(cell)} onClick={()=>onCell?.(cell)} aria-label={`${'ABCDEFGHIJ'[col]}${row+1}: ${dead?t('sunk'):shot?.hit?t('hit'):known.has(cell)?t('miss'):ship?t('ship'):t('unknown')}`}>{mark}</button>})}</div>)}
 </div>
}
export default function Harbor(){
 const [lang,setLang]=useState<Lang>('ru'),[view,setView]=useState<View>('home'),[mode,setMode]=useState<'bot'|'online'>('bot');
 const [ships,setShips]=useState<Ship[]>([]),[selected,setSelected]=useState(4),[vertical,setVertical]=useState(false),[difficulty,setDifficulty]=useState(1);
 const [game,setGame]=useState<Game|null>(null),[room,setRoom]=useState<Room|null>(null),[name,setName]=useState('');
 const [stats,setStats]=useState<Stats>({wins:0,losses:0}),[botStats,setBotStats]=useState<Stats>({wins:0,losses:0});
 const [now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[offline,setOffline]=useState(false),[toast,setToast]=useState<Key|null>(null),[modal,setModal]=useState<'rules'|'surrender'|'replace'|'leave'|null>(null),[copied,setCopied]=useState(false),[storageWarning,setStorageWarning]=useState(false),[hydrated,setHydrated]=useState(false);
 const [invite,setInvite]=useState(''),[draftReady,setDraftReady]=useState(false);
 const roomRef=useRef<Room|null>(null),nameRef=useRef(''),inFlight=useRef(false),modeRef=useRef(mode),phaseRef=useRef('');
 roomRef.current=room;nameRef.current=name;modeRef.current=mode;
 const t=useCallback((k:Key)=>dictionaries[lang][k]??dictionaries.ru[k],[lang]);
 const read=(key:string)=>{try{return localStorage.getItem(key)}catch{return null}};
 const save=useCallback((key:string,value:unknown)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{setStorageWarning(true)}},[]);
 const api=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
   if(inFlight.current){if(action!=='poll')setToast('busy');return null;}
   inFlight.current=true;if(action!=='poll')setBusy(true);
   try{
     const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:roomRef.current?.id,name:nameRef.current,...extra}),signal:AbortSignal.timeout(12000)});
     const data=await response.json() as {room?:Room|null;stats?:Stats;now?:number;error?:Key};
     if(data.now)setOffset(data.now-Date.now());
     if('room'in data){setRoom(data.room??null);roomRef.current=data.room??null;save(LS+'-room',data.room?.id??null);}
     if(data.stats)setStats(data.stats);
     if(data.error){if(action!=='poll')setToast(data.error in dictionaries.ru?data.error:'unavailable');if(response.status>=500)setOffline(true);return null;}
     setOffline(false);return data;
   }catch{setOffline(true);if(action!=='poll')setToast('unavailable');return null;}
   finally{inFlight.current=false;setBusy(false);}
 },[save]);
 useEffect(()=>{
   setShips(randomFleet());
   try{
     const l=JSON.parse(read(LS+'-lang')??'"ru"');if(l in dictionaries)setLang(l);
     setName(JSON.parse(read(LS+'-name')??'""'));
     setBotStats(JSON.parse(read(LS+'-stats')??'{"wins":0,"losses":0}'));
     const raw=read(LS+'-game');if(raw&&raw!=='null'){const restored=restoreGame(JSON.parse(raw));if(restored)setGame(restored);else setToast('invalidSave');}
     const draft=JSON.parse(read(LS+'-draft')??'null');if(draft&&Array.isArray(draft.ships)&&draft.ships.every((s:Ship,i:number)=>Array.isArray(s)&&canPlace(draft.ships.slice(0,i),s)))setShips(draft.ships);
   }catch{setToast('invalidSave');}
   setInvite(new URLSearchParams(location.search).get('room')??'');setHydrated(true);
   let remembered:string|undefined;try{remembered=JSON.parse(read(LS+'-room')??'null')??undefined}catch{}
   api('poll',{room:remembered});
 },[api]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(!hydrated)return;const timer=setInterval(()=>{if(modeRef.current==='online'||(roomRef.current&&roomRef.current.game.phase!=='finished'))api('poll')},3000);return()=>clearInterval(timer)},[hydrated,api]);
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(timer)}},[toast]);
 useEffect(()=>{if(hydrated){save(LS+'-lang',lang);document.documentElement.lang=lang;document.title=`${dictionaries[lang].brand} · ${dictionaries[lang].subtitle}`}},[lang,hydrated,save]);
 useEffect(()=>{if(hydrated)save(LS+'-name',name)},[name,hydrated,save]);
 useEffect(()=>{if(hydrated)save(LS+'-draft',{ships})},[ships,hydrated,save]);
 useEffect(()=>{if(hydrated)save(LS+'-game',game)},[game,hydrated,save]);
 useEffect(()=>{if(room&&mode==='online'){
   const key=room.id+room.game.phase;
   if(phaseRef.current!==key){setView(room.game.phase==='setup'?'setup':'game');if(room.game.phase==='setup'&&!room.players[room.me].ready)setShips(randomFleet());}
   phaseRef.current=key;
   setDraftReady(room.game.phase==='setup'&&room.players[room.me].ready);
   if(room.game.phase==='setup'&&room.players[room.me].ready)setShips(room.game.boards[room.me].ships);
 }else phaseRef.current='';},[room,mode]);
 useEffect(()=>{if(!modal)return;
   const handler=(event:KeyboardEvent)=>{if(event.key==='Escape'){setModal(null);return;}if(event.key!=='Tab')return;
     const nodes=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled),[role="dialog"] a,[role="dialog"] input'));
     const first=nodes[0],last=nodes[nodes.length-1];
     if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   };document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);
 },[modal]);
 useEffect(()=>{
   if(!game||game.phase!=='battle'||mode!=='bot'||view!=='game')return;
   const check=setInterval(()=>setGame(g=>{if(!g||g.phase!=='battle'||Date.now()<g.deadline)return g;const next=clone(g);expire(next);return next}),300);
   return()=>clearInterval(check);
 },[game?.id,mode,view]);
 useEffect(()=>{
   if(!game||game.phase!=='battle'||game.turn!==1||mode!=='bot'||view!=='game')return;
   const timer=setTimeout(()=>setGame(g=>{if(!g||g.phase!=='battle'||g.turn!==1)return g;const next=clone(g);if(expire(next))return next;const c=botTarget(next.boards[0].shots,next.difficulty);shoot(next,1,c);return next}),800);
   return()=>clearTimeout(timer);
 },[game?.id,game?.version,game?.turn,mode,view]);
 useEffect(()=>{
   if(game?.phase!=='finished'||!hydrated)return;
   try{const record=JSON.parse(read(LS+'-ledger')??'{"ids":[],"wins":0,"losses":0}');if(record.ids.includes(game.id))return;record.ids=[...record.ids,game.id].slice(-500);record[game.winner===0?'wins':'losses']++;save(LS+'-ledger',record);const st={wins:record.wins,losses:record.losses};setBotStats(st);save(LS+'-stats',st);}catch{setStorageWarning(true)}
 },[game,hydrated,save]);
 const current=mode==='online'?room?.game:game,me=mode==='online'?(room?.me??0):0;
 const pause=mode==='online'?room?.pause:null;
 const remaining=Math.min(60,Math.max(0,Math.ceil(((pause?.until??current?.deadline??0)-(now+(mode==='online'?offset:0)))/1000)));
 const leftLengths=FLEET.filter((len,index)=>ships.filter(s=>s.length===len).length<=FLEET.slice(0,index).filter(x=>x===len).length);
 function place(cell:number){
   if(draftReady)return;
   const i=ships.findIndex(s=>s.includes(cell));if(i>=0){setSelected(ships[i].length);setShips(ships.filter((_,j)=>j!==i));return;}
   const length=leftLengths.includes(selected)?selected:leftLengths[0];if(!length)return;
   const cells=cellsAt(cell,length,vertical);if(!canPlace(ships,cells)){setToast('placement');return;}
   setShips([...ships,cells]);
 }
 function beginBot(){setMode('bot');setView('setup');setDraftReady(false);setModal(null);if(!ships.length)setShips(randomFleet());}
 async function online(action:string){const data=await api(action,action==='join'?{room:invite}:{});if(data){setMode('online');setView('setup');setDraftReady(false);if(data.room?.game.phase==='setup'&&!data.room.players[data.room.me].ready)setShips(randomFleet());setInvite('');history.replaceState(null,'',location.pathname);}}
 async function ready(){if(!validFleet(ships))return setToast('placement');if(mode==='bot'){setGame(newGame(clone(ships),difficulty));setView('game')}else await api('ready',{ships})}
 function fire(cell:number){if(mode==='online'){api('shot',{cell,version:current?.version,request:crypto.randomUUID()});return;}setGame(g=>{if(!g)return g;const next=clone(g);try{if(expire(next))return next;shoot(next,0,cell);return next}catch{return g}})}
 function saveLayout(){const layout=view==='game'?current?.boards[me].ships:ships;if(layout&&validFleet(layout)){save(LS+'-layout',layout);setToast('savedOk')}else setToast('placement')}
 function loadLayout(){try{const layout=JSON.parse(read(LS+'-layout')??'null');if(validFleet(layout))setShips(layout);else setToast('noSaved')}catch{setToast('noSaved')}}
 async function giveUp(){setModal(null);if(mode==='online')await api('surrender');else setGame(g=>{if(!g)return g;const n=clone(g);surrender(n,0);return n})}
 async function leave(){if(mode==='online'&&room?.game.phase==='setup'){const data=await api('leave');if(!data)return;}setMode('bot');setView('home');setModal(null);}
 const activeOnline=room&&room.game.phase!=='finished';
 return <div className="harbor-app">
 <header className="topbar"><button className="brand" onClick={()=>{if(mode==='online'&&room?.game.phase==='setup')setModal('leave');else setView('home')}}><span className="brand-mark"><Anchor size={23}/></span><span>{t('brand')}<small>{t('subtitle')}</small></span></button><nav><button className="quiet rules-button" aria-label={t('rules')} onClick={()=>setModal('rules')}><HelpCircle size={18}/><span>{t('rules')}</span></button><label className="language"><Globe2 size={17}/><select aria-label="Language / Язык / Тіл" value={lang} onChange={e=>setLang(e.target.value as Lang)}><option value="ru">RU</option><option value="kk">ҚАЗ</option><option value="en">EN</option></select></label></nav></header>
 <main>
 {storageWarning&&<p role="status" className="notice">{t('storage')}</p>}
 {offline&&mode==='online'&&<p role="status" className="notice"><Loader2 className="spin" size={18}/>{t('offline')}</p>}
 {view==='home'?<>
   <div className="welcome"><div><p className="eyebrow">{t('subtitle')} / 01</p><h1>{t('intro')}</h1><p className="muted">{t('play')}</p></div><label className="name-input"><span>{t('name')}</span><input maxLength={24} placeholder={t('guest')} value={name} onChange={e=>setName(e.target.value)}/></label></div>
   {invite&&<div className="invitation"><Users size={22}/><span>{t('invite')}</span><button className="primary" disabled={busy} onClick={()=>online('join')}>{t('join')}</button></div>}
   {(activeOnline||game?.phase==='battle')&&<button className="resume" onClick={()=>{if(activeOnline){setMode('online');setView(room.game.phase==='setup'?'setup':'game')}else{setMode('bot');setView('game')}}}><RefreshCw size={18}/>{t('continue')}<span className="resume-chip">{activeOnline?t('people'):t('computer')}</span></button>}
   <div className="home-grid"><section className="modes">
    <article className="mode-card featured"><div className="mode-heading"><span className="mode-icon"><Monitor size={20}/></span><span className="number">01</span></div><h2>{t('bot')}</h2><p>{t('botDesc')}</p><div className="difficulty" aria-label={t('bot')}>{(['easy','medium','hard'] as Key[]).map((key,i)=><button key={key} aria-pressed={difficulty===i} className={difficulty===i?'chosen':''} onClick={()=>setDifficulty(i)}>{t(key)}</button>)}</div><button className="primary wide" disabled={!!activeOnline} onClick={()=>game?.phase==='battle'?setModal('replace'):beginBot()}>{t('start')}<Swords size={18}/></button></article>
    <article className="mode-card"><div className="mode-heading"><span className="mode-icon"><Users size={20}/></span><span className="number">02</span></div><h2>{t('friend')}</h2><p>{t('friendDesc')}</p><button className="secondary wide" disabled={busy||!!activeOnline} onClick={()=>online('create')}>{busy?<Loader2 size={18} className="spin"/>:t('create')}</button></article>
    <article className="mode-card"><div className="mode-heading"><span className="mode-icon"><Shuffle size={20}/></span><span className="number">03</span></div><h2>{t('random')}</h2><p>{t('randomDesc')}</p><button className="secondary wide" disabled={busy||!!activeOnline} onClick={()=>online('search')}>{t('search')}</button></article>
   </section><aside className="home-side"><div className="fleet-preview"><div className="section-label"><span><Shield size={17}/>{t('yourFleet')}</span><span>{ships.length} / 10</span></div><Board ships={ships} title={t('yourFleet')} t={t}/><div className="board-caption"><span>{t('soundless')}</span><Anchor size={16}/></div></div><div className="stats-panel">{[[t('computer'),botStats],[t('people'),stats]].map(([label,s])=><div className="stat-row" key={label as string}><span>{label as string}</span><div><strong>{(s as Stats).wins}</strong><small>{t('wins')}</small></div><div><strong>{(s as Stats).losses}</strong><small>{t('losses')}</small></div></div>)}</div></aside></div>
 </>:view==='setup'?<>
   <button className="back quiet" onClick={()=>mode==='online'?setModal('leave'):setView('home')}><ArrowLeft size={17}/>{t('back')}</button>
   <div className="page-heading"><div><p className="eyebrow">{t('subtitle')} / 02</p><h1>{t('setup')}</h1><p className="muted">{t('setupHint')}</p></div><span className="phase-tag"><Shield size={16}/>{ships.length} / 10</span></div>
   {mode==='online'&&room&&<div className="room-strip"><div><Users size={20}/><span>{room.players.length<2?(room.public?t('searching'):t('waiting')):(room.players[1-room.me]?.name||t('guest'))}</span>{room.players.length<2&&<Loader2 size={17} className="spin"/>}</div>{!room.public&&<button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/?room=${room.id}`);setCopied(true);setTimeout(()=>setCopied(false),3000)}catch{setCopied(false)}}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?t('copied'):t('copy')}</button>}{!room.public&&<input className="invite-input" readOnly aria-label={t('invite')} value={typeof location!=='undefined'?`${location.origin}/?room=${room.id}`:''} onFocus={e=>e.target.select()}/>} {room.public&&room.players.length<2&&<small>{t('searchHint')}</small>}</div>}
   <div className="setup-grid"><section className="board-panel"><div className="section-label"><span>{name||t('guest')}</span><span>A — J / 1 — 10</span></div><Board ships={ships} onCell={place} disabled={draftReady} title={t('yourFleet')} t={t}/><p className="board-note">{t('remove')}</p></section><aside className="setup-controls"><h2>{t('yourFleet')}</h2><p className="muted">{t('remaining')}: {10-ships.length}</p><div className="ship-picker">{[4,3,2,1].map(len=>{const total=FLEET.filter(n=>n===len).length,placed=ships.filter(s=>s.length===len).length;return <button key={len} disabled={placed>=total||draftReady} aria-pressed={selected===len} className={selected===len&&placed<total?'selected':''} onClick={()=>setSelected(len)}><span className="ship-blocks">{Array.from({length:len},(_,i)=><i key={i}/>)}</span><span>{len} {t('shipUnit')}</span><small>{placed}/{total}</small></button>})}</div><div className="control-pair"><button className="secondary" disabled={draftReady} onClick={()=>setVertical(!vertical)}><RotateCw size={17}/>{t('rotate')}<span>{vertical?'↕':'↔'}</span></button><button className="secondary" disabled={draftReady} onClick={()=>setShips(randomFleet())}><Shuffle size={17}/>{t('auto')}</button></div><div className="control-pair"><button className="quiet" disabled={draftReady} onClick={()=>setShips([])}>{t('clear')}</button><button className="quiet" disabled={draftReady} onClick={loadLayout}>{t('saved')}</button></div><button className="quiet save-layout" disabled={!validFleet(ships)} onClick={saveLayout}><Save size={16}/>{t('save')}</button><button className="primary wide ready-button" disabled={!validFleet(ships)||draftReady||busy} onClick={ready}>{draftReady?<Check size={18}/>:<Swords size={18}/>} {draftReady?t('readyWait'):t('ready')}</button>{mode==='online'&&room?.players[1-room.me]?.ready&&<p className="ready-caption">{t('readyOther')}</p>}</aside></div>
 </>:current?<>
   <button className="back quiet" onClick={()=>setView('home')}><ArrowLeft size={17}/>{t('home')}</button>
   <div className={`battle-status ${current.phase==='finished'?'ended':''}`}><div><p className="eyebrow">{t('subtitle')} / 03</p><h1>{current.phase==='finished'?(current.winner===null?t('draw'):current.winner===me?t('win'):t('lose')):pause?t('connection'):current.turn===me?t('yourTurn'):t('enemyTurn')}</h1><p className="muted">{current.phase==='finished'?t(({fleet:'fleet',surrender:'surrendered',disconnect:'disconnected',abandoned:'abandoned',cancelled:'cancelled'} as Record<string,Key>)[current.reason]??'draw'):mode==='bot'?`${t('computer')} · ${t((['easy','medium','hard'] as Key[])[current.difficulty])}`:room?.players[1-me]?.name}</p></div>{current.phase==='battle'&&<div className={`timer ${remaining<=10?'urgent':''}`} role="timer" aria-label={`${remaining} ${t('seconds')}`}><Timer size={22}/><strong>{remaining.toString().padStart(2,'0')}</strong><small>{t('seconds')}</small></div>}</div>
   <div className="battle-grid"><section className={`board-panel enemy ${current.phase==='battle'&&current.turn===me&&!pause?'active-board':''}`}><div className="section-label"><span><Target size={18}/>{t('enemyFleet')}</span><span>{t('left')}: {10-current.boards[1-me].shots.filter(s=>s.sunk).length}</span></div><Board ships={current.phase==='finished'?current.boards[1-me].ships:[]} shots={current.boards[1-me].shots} onCell={fire} disabled={current.phase!=='battle'||current.turn!==me||!!pause||busy||(mode==='online'&&offline)} title={t('enemyFleet')} t={t}/><p className="board-note">{t('legend')}</p></section><section className="board-panel own"><div className="section-label"><span><Shield size={18}/>{t('yourFleet')}</span><span>{t('left')}: {10-current.boards[me].shots.filter(s=>s.sunk).length}</span></div><Board ships={current.boards[me].ships} shots={current.boards[me].shots} title={t('yourFleet')} t={t}/><p className="board-note">{name||t('guest')} · {mode==='online'?t('people'):t('computer')}</p></section></div>
   <div className="battle-actions">{current.phase==='battle'?<button className="quiet danger" onClick={()=>setModal('surrender')}><Flag size={17}/>{t('surrender')}</button>:<><button className="primary" disabled={busy||(mode==='online'&&room?.players[me]?.rematch)} onClick={()=>mode==='bot'?beginBot():api('rematch')}><RefreshCw size={17}/>{mode==='bot'?t('again'):room?.players[me]?.rematch?t('rematchWait'):t('rematch')}</button><button className="secondary" onClick={saveLayout}><Save size={17}/>{t('save')}</button></>}</div>
 </>:<p>{t('loading')}</p>}
 </main><footer><span>{t('footer')}</span><span>{t('brand')} © 2026</span></footer>
 {toast&&<div className="toast" role="status"><span>{t(toast)}</span><button aria-label={t('close')} onClick={()=>setToast(null)}><X size={16}/></button></div>}
 {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal" onClick={e=>e.stopPropagation()}><button autoFocus className="modal-close quiet" aria-label={t('close')} onClick={()=>setModal(null)}><X size={21}/></button><Anchor size={30}/><h2 id="dialog-title">{t(modal==='rules'?'rules':modal==='surrender'?'surrenderAsk':modal==='leave'?'confirmLeave':'newAsk')}</h2>{modal==='rules'?<><p>{t('rulesText')}</p><button className="primary wide" onClick={()=>setModal(null)}>{t('close')}</button></>:<div className="modal-actions"><button className="secondary" onClick={()=>setModal(null)}>{t('cancel')}</button><button className="primary" onClick={modal==='surrender'?giveUp:modal==='leave'?leave:beginBot}>{t(modal==='surrender'?'yes':modal==='leave'?'home':'start')}</button></div>}</section></div>}
 </div>
}


