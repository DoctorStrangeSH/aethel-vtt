import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState, CharacterStats, InventoryItem } from '@aethel/shared';
import { supabase, getRoomId, subscribeToRoom, saveRoom, createRoom, loginWithGitHub, loginWithEmail, registerWithEmail, logoutUser, onUserChanged, uploadMap } from './supabase';

interface ChatMessage { id: number; sender: string; text: string; time: string; }
interface SpellResult { name: string; level: number; school: string; casting_time: string; range: string; components: string[]; duration: string; description: string; }
interface MapObject { id: string; x: number; y: number; type: string; color: string; label: string; }
interface MapEffect { id: string; x: number; y: number; radius: number; color: string; alpha: number; label: string; }

const CANVAS_W = 600; const CANVAS_H = 400; const FOG_CELL = 20;
const OBJECT_TYPES = [
  { type: 'door', icon: '🚪', color: '#8B4513', label: 'Дверь' },
  { type: 'chest', icon: '📦', color: '#DAA520', label: 'Сундук' },
  { type: 'trap', icon: '⚠', color: '#e94560', label: 'Ловушка' },
  { type: 'npc', icon: '👤', color: '#4ecca3', label: 'NPC' },
  { type: 'pillar', icon: '⬤', color: '#888', label: 'Колонна' },
];
const DICE = [4, 6, 8, 10, 12, 20, 100];
const STAT_NAMES: { key: keyof CharacterStats; label: string }[] = [
  { key: 'strength', label: 'Сила' }, { key: 'dexterity', label: 'Ловкость' }, { key: 'constitution', label: 'Телосложение' },
  { key: 'intelligence', label: 'Интеллект' }, { key: 'wisdom', label: 'Мудрость' }, { key: 'charisma', label: 'Харизма' },
];

export function App() {
  const [roomId, setRoomId] = createSignal(getRoomId());
  const [user, setUser] = createSignal<{ login: string; avatar_url: string } | null>(null);
  const [tokens, setTokens] = createSignal<TokenState[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal('');
  const [spellName, setSpellName] = createSignal(''); const [spellResult, setSpellResult] = createSignal<SpellResult | null>(null);
  const [spellLoading, setSpellLoading] = createSignal(false); const [spellError, setSpellError] = createSignal('');
  const [showCompendium, setShowCompendium] = createSignal(false);
  const [authMode, setAuthMode] = createSignal<'login' | 'register' | null>(null);
  const [email, setEmail] = createSignal(''); const [password, setPassword] = createSignal(''); const [displayName, setDisplayName] = createSignal('');
  const [authMsg, setAuthMsg] = createSignal(''); const [authIsError, setAuthIsError] = createSignal(false);
  const [mapUrl, setMapUrl] = createSignal<string | null>(null);
  const [fog, setFog] = createSignal<number[][]>([]); const [fogEnabled, setFogEnabled] = createSignal(true);
  const [fogMode, setFogMode] = createSignal<'reveal' | 'hide'>('reveal'); const [brushRadius, setBrushRadius] = createSignal(2);
  const [objects, setObjects] = createSignal<MapObject[]>([]); const [effects, setEffects] = createSignal<MapEffect[]>([]);
  const [placingObject, setPlacingObject] = createSignal<string | null>(null); const [placingEffect, setPlacingEffect] = createSignal(false);
  const [showDice, setShowDice] = createSignal(false); const [diceType, setDiceType] = createSignal(20);
  const [diceMod, setDiceMod] = createSignal(0); const [diceCount, setDiceCount] = createSignal(1);
  const [diceResult, setDiceResult] = createSignal<number | null>(null); const [diceRolling, setDiceRolling] = createSignal(false);
  const [diceParts, setDiceParts] = createSignal<number[]>([]);
  const [sheetToken, setSheetToken] = createSignal<TokenState | null>(null);
  const [showNewRoom, setShowNewRoom] = createSignal(false); const [newRoomName, setNewRoomName] = createSignal('');
  let chatContainer: HTMLDivElement | undefined; let canvasRef: HTMLCanvasElement | undefined;
  let isDragging = false; let dragTokenId: string | null = null; let isLocalChange = false;

  const initFog = () => Array.from({ length: Math.ceil(CANVAS_H / FOG_CELL) }, () => Array(Math.ceil(CANVAS_W / FOG_CELL)).fill(0));
  const defaultStats = (): CharacterStats => ({ strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, ac: 10, speed: 30 });

  const saveToServer = () => {
    isLocalChange = true;
    saveRoom(roomId(), { tokens: engine.getTokens(), messages: messages(), fog: fog(), objects: objects(), effects: effects() });
    setTimeout(() => { isLocalChange = false; }, 500);
  };

  const goToRoom = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.pushState({}, '', url.toString());
    setRoomId(id);
    setTokens([]); setMessages([]); setFog(initFog()); setObjects([]); setEffects([]);
    engine.loadTokens([]);
    loadRoom(id);
  };

  const createNewRoom = async () => {
    const name = newRoomName().trim(); if (!name) return;
    const id = await createRoom(name);
    setShowNewRoom(false); setNewRoomName('');
    goToRoom(id);
  };

  const loadRoom = (id: string) => {
    const unsub = subscribeToRoom(id, (data) => {
      if (isLocalChange) return;
      if (data) {
        engine.loadTokens(data.tokens || []);
        setTokens(data.tokens || []);
        setMessages(data.messages || []);
        setFog(data.fog?.length ? data.fog : initFog());
        setObjects(data.objects || []);
        setEffects(data.effects || []);
        drawCanvas();
      } else {
        engine.addToken({ id: 'hero-1', position: { x: 200, y: 200 }, rotation: 0, hidden: false, conditions: [], hp: 45, maxHp: 52, ownerId: 'player-1', lockedBy: null, stats: defaultStats(), inventory: [] });
        engine.addToken({ id: 'goblin-1', position: { x: 400, y: 150 }, rotation: 0, hidden: false, conditions: [], hp: 7, maxHp: 7, ownerId: null, lockedBy: null, stats: defaultStats(), inventory: [] });
        setFog(initFog());
        saveToServer();
      }
    });
    return unsub;
  };

    const openAuth = (mode: 'login' | 'register') => { setAuthMode(mode); setAuthMsg(''); setAuthIsError(false); setEmail(''); setPassword(''); setDisplayName(''); };
  const closeAuth = () => setAuthMode(null);

  const handleEmailAuth = async () => {
    setAuthMsg(''); setAuthIsError(false);
    if (password().length < 6) { setAuthMsg('Минимум 6 символов'); setAuthIsError(true); return; }
    try {
      if (authMode() === 'register') {
        const { error } = await registerWithEmail(email(), password(), displayName().trim() || undefined);
        if (error) { setAuthMsg(error.message.includes('already') ? 'Почта уже занята' : error.message); setAuthIsError(true); }
        else { setAuthMsg('✅ Проверьте почту'); setAuthIsError(false); }
      } else {
        const { error } = await loginWithEmail(email(), password());
        if (error) { setAuthMsg(error.message.includes('Invalid') ? 'Неверная почта или пароль' : error.message); setAuthIsError(true); }
        else closeAuth();
      }
    } catch (e: any) { setAuthMsg(e.message); setAuthIsError(true); }
  };

  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser({ login: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'Игрок', avatar_url: data.session.user.user_metadata?.avatar_url || '' });
    });
    const u1 = onUserChanged((u) => setUser(u ? { login: u.name || u.email || 'Игрок', avatar_url: u.avatar || '' } : null));
    const unsubRoom = loadRoom(roomId());
    const u3 = engine.onUpdate(() => { setTokens(engine.getTokens()); drawCanvas(); saveToServer(); });
    onCleanup(() => { u1(); unsubRoom(); u3(); });
  });

  const drawCanvas = () => {
    const c = canvasRef; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const map = mapUrl(); if (map) { const img = new Image(); img.src = map; if (img.complete) ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); else { img.onload = () => { ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); drawCanvas(); }; return; } }
    effects().forEach(ef => { ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.radius, 0, Math.PI*2); ctx.fillStyle = ef.color + Math.round(ef.alpha*255).toString(16).padStart(2,'0'); ctx.fill(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let x=0;x<CANVAS_W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CANVAS_H);ctx.stroke();}
    for (let y=0;y<CANVAS_H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CANVAS_W,y);ctx.stroke();}
    objects().forEach(obj=>{ctx.beginPath();ctx.arc(obj.x,obj.y,14,0,Math.PI*2);ctx.fillStyle=obj.color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});
    engine.getTokens().forEach(t=>{
      const {x,y}=t.position;ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fillStyle=t.ownerId?'#4ecca3':'#e94560';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(t.id,x,y+30);
      const pct=t.hp/t.maxHp;ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(x-18,y-28,36,4);ctx.fillStyle=pct>.5?'#4ecca3':pct>.25?'#f0a500':'#e94560';ctx.fillRect(x-18,y-28,36*pct,4);
    });
    if(fogEnabled()){const f=fog();for(let r=0;r<f.length;r++)for(let c=0;c<(f[r]?.length||0);c++)if(f[r][c]===0){ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(c*FOG_CELL,r*FOG_CELL,FOG_CELL,FOG_CELL);}}
  };

  const applyFog=(cx:number,cy:number)=>{const f=fog().map(r=>[...r]);const col=Math.floor(cx/FOG_CELL),row=Math.floor(cy/FOG_CELL),val=fogMode()==='reveal'?1:0,rad=brushRadius();for(let dr=-rad;dr<=rad;dr++)for(let dc=-rad;dc<=rad;dc++){if(dr*dr+dc*dc>rad*rad)continue;const r=row+dr,c=col+dc;if(r>=0&&r<f.length&&c>=0&&c<(f[0]?.length||0))f[r][c]=val;}setFog(f);drawCanvas();saveToServer();};
  const toLocal=(cx:number,cy:number)=>{const r=canvasRef?.getBoundingClientRect();if(!r)return{x:0,y:0};return{x:(cx-r.left)*CANVAS_W/r.width,y:(cy-r.top)*CANVAS_H/r.height};};
  const onMD=(e:MouseEvent)=>{const{x,y}=toLocal(e.clientX,e.clientY);if(e.shiftKey){applyFog(x,y);return;}if(placingObject()){const t=OBJECT_TYPES.find(o=>o.type===placingObject());if(t){setObjects(p=>[...p,{id:`obj-${Date.now()}`,x,y,type:t.type,color:t.color,label:t.label}]);setPlacingObject(null);drawCanvas();saveToServer();}return;}if(placingEffect()){setEffects(p=>[...p,{id:`ef-${Date.now()}`,x,y,radius:50,color:'#ff6600',alpha:.3,label:'огонь'}]);setPlacingEffect(false);drawCanvas();saveToServer();return;}const tk=engine.getTokens().find(t=>Math.hypot(t.position.x-x,t.position.y-y)<24);if(tk){isDragging=true;dragTokenId=tk.id;}};
  const onMM=(e:MouseEvent)=>{const{x,y}=toLocal(e.clientX,e.clientY);if(e.shiftKey){applyFog(x,y);return;}if(!isDragging||!dragTokenId)return;engine.moveToken(dragTokenId,{x:Math.max(20,Math.min(CANVAS_W-20,x)),y:Math.max(20,Math.min(CANVAS_H-20,y))});};
  const onMU=()=>{isDragging=false;dragTokenId=null;};

  const hpPct=(t:TokenState)=>Math.round(t.hp/t.maxHp*100);
  const hpCol=(t:TokenState)=>{const p=hpPct(t);return p>50?'#4ecca3':p>25?'#f0a500':'#e94560';};
  const at=()=>{const l=tokens();return l.length?l[activeIndex()]:undefined;};

  // Sheet
  const openSheet=(t:TokenState)=>{if(!t.stats)t.stats=defaultStats();if(!t.inventory)t.inventory=[];setSheetToken({...t});};
  const updateSheetStat=(k:keyof CharacterStats,v:number)=>{const t=sheetToken();if(!t?.stats)return;t.stats[k]=v;setSheetToken({...t});};
  const addInv=()=>{const t=sheetToken();if(!t)return;const n=prompt('Предмет:');if(!n)return;t.inventory=[...(t.inventory||[]),{name:n,quantity:1,weight:0}];setSheetToken({...t});};
  const removeInv=(i:number)=>{const t=sheetToken();if(!t)return;t.inventory=(t.inventory||[]).filter((_,j)=>j!==i);setSheetToken({...t});};
  const saveSheet=()=>{const t=sheetToken();if(!t)return;const ex=engine.getTokens().find(tk=>tk.id===t.id);if(ex){ex.stats=t.stats;ex.inventory=t.inventory;engine.loadTokens(engine.getTokens());drawCanvas();saveToServer();}setSheetToken(null);};

  const searchSpell=async()=>{const n=spellName().trim();if(!n)return;setSpellLoading(true);setSpellError('');setSpellResult(null);try{const r=await fetch(`https://www.dnd5eapi.co/api/spells/${n.toLowerCase().replace(/ /g,'-')}`);if(!r.ok){setSpellError('Не найдено');setSpellLoading(false);return;}const d=await r.json();setSpellResult({name:d.name,level:d.level,school:d.school?.name||'?',casting_time:d.casting_time||'—',range:d.range||'—',components:d.components||[],duration:d.duration||'—',description:d.desc?.join('\n')||''});}catch{setSpellError('Ошибка');}setSpellLoading(false);};
  const addToken=()=>{const n=['Гоблин','Орк','Скелет','Волк','Бандит','Зомби','Крыса'][Math.random()*7|0];engine.addToken({id:`${n.toLowerCase()}-${Date.now()}`,position:{x:100+Math.random()*400,y:100+Math.random()*200},rotation:0,hidden:false,conditions:[],hp:Math.random()*20+5|0,maxHp:Math.random()*20+5|0,ownerId:null,lockedBy:null,stats:defaultStats(),inventory:[]});};
  const sendMsg=()=>{const tx=inputText().trim();if(!tx)return;const now=new Date();setMessages(p=>[...p,{id:Date.now(),sender:user()?.login||'Аноним',text:tx,time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`}]);setInputText('');saveToServer();};
  const rollDiceFull=()=>{setDiceRolling(true);setDiceResult(null);setDiceParts([]);let c=0;const iv=setInterval(()=>{const pts:number[]=[];for(let i=0;i<diceCount();i++)pts.push(Math.floor(Math.random()*diceType())+1);setDiceParts(pts);setDiceResult(pts.reduce((a,b)=>a+b,0)+diceMod());if(++c>=10){clearInterval(iv);const fp:number[]=[];for(let i=0;i<diceCount();i++)fp.push(Math.floor(Math.random()*diceType())+1);const t=fp.reduce((a,b)=>a+b,0)+diceMod();setDiceParts(fp);setDiceResult(t);setDiceRolling(false);const now=new Date();const mod=diceMod()!==0?(diceMod()>0?` + ${diceMod()}`:` - ${Math.abs(diceMod())}`):'';const ptsStr=diceCount()>1?` [${fp.join(', ')}]`:'';setMessages(p=>[...p,{id:Date.now(),sender:'🎲',text:`${diceCount()}d${diceType()}${mod}: ${t}${ptsStr}`,time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`}]);saveToServer();}},80);};

  return (
    <div class="app">
      <h1>Aethel VTT</h1>
      <div class="user-bar">
        <div style="display:flex;align-items:center;gap:10px;margin-right:auto">
          <span style="font-size:12px;color:#777">Комната:</span>
          <code style="background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:6px;font-size:13px">{roomId()}</code>
          <button class="btn btn-ghost" onClick={()=>{const url=new URL(window.location.href);navigator.clipboard.writeText(url.toString());alert('Ссылка скопирована!');}}>📋 Копировать</button>
          <button class="btn btn-ghost" onClick={()=>setShowNewRoom(true)}>＋ Новая</button>
        </div>
        {user()?<div class="user-info"><img class="user-avatar" src={user()!.avatar_url||''} alt="" /><span class="user-name">{user()!.login}</span><button class="btn btn-ghost" onClick={()=>{logoutUser();setUser(null);}}>Выйти</button></div>:<div class="auth-buttons"><button class="btn btn-ghost" onClick={()=>openAuth('login')}>Войти</button><button class="btn btn-primary" onClick={()=>openAuth('register')}>Регистрация</button></div>}
      </div>
      {authMode()&&<div class="modal-overlay" onClick={closeAuth}><div class="modal" onClick={e=>e.stopPropagation()}><h3>{authMode()==='login'?'Вход':'Регистрация'}</h3>{authMsg()&&<div class={`auth-msg ${authIsError()?'auth-err':'auth-ok'}`}>{authMsg()}</div>}<form onSubmit={e=>{e.preventDefault();handleEmailAuth();}}>{authMode()==='register'&&<input class="input" type="text" placeholder="Ваше имя" value={displayName()} onInput={e=>setDisplayName(e.currentTarget.value)} />}<input class="input" type="email" placeholder="Email" value={email()} onInput={e=>setEmail(e.currentTarget.value)} /><input class="input" type="password" placeholder="Пароль" value={password()} onInput={e=>setPassword(e.currentTarget.value)} minlength="6" /><button class="btn btn-primary" type="submit" style="width:100%">{authMode()==='login'?'Войти':'Зарегистрироваться'}</button></form><div class="auth-sep">или</div><button class="btn btn-github" onClick={loginWithGitHub}>🐙 Войти через GitHub</button><p class="auth-switch">{authMode()==='login'?<>Нет аккаунта? <span onClick={()=>openAuth('register')}>Зарегистрироваться</span></>:<>Уже есть аккаунт? <span onClick={()=>openAuth('login')}>Войти</span></>}</p></div></div>}
      {showNewRoom()&&<div class="modal-overlay" onClick={()=>setShowNewRoom(false)}><div class="modal" onClick={e=>e.stopPropagation()}><h3>Новая комната</h3><input class="input" type="text" placeholder="Название" value={newRoomName()} onInput={e=>setNewRoomName(e.currentTarget.value)} /><button class="btn btn-primary" onClick={createNewRoom} style="width:100%">Создать</button></div></div>}
      <div class="layout">
        <div class="left-column">
          <div class="map-controls" style="flex-wrap:wrap">
            <label class="btn btn-ghost" style="cursor:pointer">🗺 Карта<input type="file" accept="image/*" onChange={e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)uploadMap(f).then(u=>{setMapUrl(u);drawCanvas()}).catch(err=>alert('Ошибка: '+err.message));}} hidden /></label>
            {mapUrl()&&<button class="btn btn-ghost" onClick={()=>{setMapUrl(null);drawCanvas();}}>✕</button>}
            <button class={`btn ${fogEnabled()?'btn-primary':'btn-ghost'}`} onClick={()=>{setFogEnabled(!fogEnabled());drawCanvas()}}>🌫 {fogEnabled()?'ON':'OFF'}</button>
            <button class={`btn ${fogMode()==='reveal'?'btn-heal':'btn-ghost'}`} onClick={()=>setFogMode(fogMode()==='reveal'?'hide':'reveal')}>{fogMode()==='reveal'?'🔓':'🔒'}</button>
            <select class="btn btn-ghost" value={brushRadius()} onChange={e=>setBrushRadius(Number(e.currentTarget.value))} style="padding:8px 10px">{[1,2,3,4,5].map(n=><option value={n}>Кисть {n}</option>)}</select>
            <select class="btn btn-ghost" value={placingObject()||''} onChange={e=>{setPlacingObject(e.currentTarget.value||null);setPlacingEffect(false);}} style="padding:8px 10px"><option value="">➕ Объект...</option>{OBJECT_TYPES.map(o=><option value={o.type}>{o.icon} {o.label}</option>)}</select>
            {objects().length>0&&<button class="btn btn-ghost" onClick={()=>{setObjects([]);drawCanvas();saveToServer();}}>✕ Объекты</button>}
            <button class={`btn ${placingEffect()?'btn-heal':'btn-ghost'}`} onClick={()=>{setPlacingEffect(!placingEffect());setPlacingObject(null);}}>🔥 Эффект</button>
            {effects().length>0&&<button class="btn btn-ghost" onClick={()=>{setEffects([]);drawCanvas();saveToServer();}}>✕ Эффекты</button>}
          </div>
          <div class="minimap-container"><canvas ref={el=>(canvasRef=el)} width={CANVAS_W} height={CANVAS_H} class="minimap-canvas" onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onContextMenu={e=>e.preventDefault()} /></div>
          <div class="tracker"><div class="tracker-header"><h2 class="tracker-title">Combat Tracker</h2><button class="btn btn-ghost" onClick={()=>{const l=tokens();if(l.length)setActiveIndex(p=>(p+1)%l.length)}}>→</button></div><ul class="tracker-list">{tokens().length===0&&<li class="tracker-empty">Нет токенов</li>}{tokens().map((t,i)=>(<li class={`tracker-item ${i===activeIndex()?'active':''}`}><div class="turn-indicator">{i===activeIndex()?'▶':''}</div><button class="token-remove" onClick={e=>{e.stopPropagation();engine.removeToken(t.id)}}>✕</button><div class="token-icon"><div class="icon-placeholder" /></div><div class="token-info"><span class="token-name" style="cursor:pointer;text-decoration:underline" onClick={()=>{openSheet(t);setActiveIndex(i)}}>{t.id}</span>{t.conditions.length>0&&<span class="token-conditions">{t.conditions.join(', ')}</span>}</div><div class="token-hp-bar"><div class="token-hp-fill" style={{width:`${hpPct(t)}%`,'background-color':hpCol(t)}} /></div><span class="token-hp-text">{t.hp}/{t.maxHp}</span></li>))}</ul></div>
          <div class="actions"><button class="btn btn-ghost" onClick={addToken}>＋ Токен</button><button class="btn btn-danger" onClick={()=>{const t=at();if(t)engine.damageToken(t.id,5)}}>⚔ Урон</button><button class="btn btn-heal" onClick={()=>{const t=at();if(t)engine.healToken(t.id,5)}}>❤ Лечение</button></div>
        </div>
        <div class="right-column">
          <div class="compendium"><div class="compendium-header"><h2 class="compendium-title">📖 Заклинания</h2><button class="btn btn-ghost" onClick={()=>setShowCompendium(!showCompendium())}>{showCompendium()?'Скрыть':'Поиск'}</button></div>{showCompendium()&&<div class="compendium-body"><div class="compendium-search"><input class="input" type="text" placeholder="Fireball..." value={spellName()} onInput={e=>setSpellName(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchSpell()}}} /><button class="btn btn-primary" onClick={searchSpell}>🔍</button></div>{spellLoading()&&<p class="compendium-status">Поиск...</p>}{spellError()&&<p class="compendium-error">{spellError()}</p>}{spellResult()&&<div class="spell-card"><h3 class="spell-name">{spellResult()!.name}</h3><p class="spell-meta">Ур. {spellResult()!.level} • {spellResult()!.school}</p><p class="spell-detail">⏱ {spellResult()!.casting_time}</p><p class="spell-detail">📏 {spellResult()!.range}</p><p class="spell-detail">🧪 {spellResult()!.components.join(', ')||'—'}</p><p class="spell-detail">⏳ {spellResult()!.duration}</p><p class="spell-desc">{spellResult()!.description}</p></div>}</div>}</div>
          <div class="chat"><h2 class="chat-title">Чат</h2><div class="chat-messages" ref={el=>(chatContainer=el)}>{messages().length===0&&<p class="chat-empty">Нет сообщений</p>}{messages().map(m=>(<div class="chat-message"><span class="chat-sender">{m.sender}</span><span class="chat-time">{m.time}</span><p class="chat-text">{m.text}</p></div>))}</div><div class="chat-dice"><button class="dice-btn" onClick={()=>setShowDice(true)}>🎲 Бросок</button>{[20,6,8].map(s=><button class="dice-btn" onClick={()=>{const r=Math.random()*s+1|0;const now=new Date();setMessages(p=>[...p,{id:Date.now(),sender:'🎲',text:`1d${s}: ${r}`,time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`}]);saveToServer();}}>d{s}</button>)}</div><div class="chat-input-area"><input class="chat-input" type="text" placeholder="Сообщение..." value={inputText()} onInput={e=>setInputText(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}}} /><button class="chat-send-btn" onClick={sendMsg}>→</button></div></div>
        </div>
      </div>
      {showDice()&&<div class="modal-overlay" onClick={()=>setShowDice(false)}><div class="modal modal-dice" onClick={e=>e.stopPropagation()}><h3>🎲 Бросок</h3><div class="dice-panel"><div class="dice-row"><span>Кубик:</span><select class="input" value={diceType()} onChange={e=>setDiceType(Number(e.currentTarget.value))}>{DICE.map(d=><option value={d}>d{d}</option>)}</select></div><div class="dice-row"><span>Кол-во:</span><input class="input" type="number" min="1" max="20" value={diceCount()} onInput={e=>setDiceCount(Number(e.currentTarget.value)||1)} /></div><div class="dice-row"><span>Мод:</span><input class="input" type="number" value={diceMod()} onInput={e=>setDiceMod(Number(e.currentTarget.value)||0)} /></div>{diceResult()!==null&&<div class="dice-result"><span class="dice-total">{diceResult()}</span>{diceParts().length>1&&<span class="dice-parts">[{diceParts().join(', ')}]</span>}</div>}<button class="btn btn-primary" onClick={rollDiceFull} disabled={diceRolling()} style="width:100%;margin-top:12px">{diceRolling()?'🎲 Бросаем...':'🎲 Бросить'}</button></div></div></div>}
      {sheetToken()&&<div class="modal-overlay" onClick={()=>setSheetToken(null)}><div class="modal modal-sheet" onClick={e=>e.stopPropagation()}><h3>📋 {sheetToken()!.id}</h3><div class="sheet-grid">{STAT_NAMES.map(s=><div class="sheet-stat"><span>{s.label}</span><input class="input" type="number" value={sheetToken()!.stats?.[s.key]??10} onInput={e=>updateSheetStat(s.key,Number(e.currentTarget.value)||0)} /></div>)}<div class="sheet-stat"><span>AC</span><input class="input" type="number" value={sheetToken()!.stats?.ac??10} onInput={e=>updateSheetStat('ac',Number(e.currentTarget.value)||0)} /></div><div class="sheet-stat"><span>Скорость</span><input class="input" type="number" value={sheetToken()!.stats?.speed??30} onInput={e=>updateSheetStat('speed',Number(e.currentTarget.value)||0)} /></div></div><h4 style="margin-top:16px;color:#aaa;font-size:13px">🎒 Инвентарь</h4><ul class="inv-list">{(sheetToken()!.inventory||[]).map((item,i)=><li class="inv-item"><span>{item.name}</span><button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onClick={()=>removeInv(i)}>✕</button></li>)}</ul><button class="btn btn-ghost" onClick={addInv} style="width:100%;margin-top:8px">＋ Предмет</button><button class="btn btn-primary" onClick={saveSheet} style="width:100%;margin-top:12px">💾 Сохранить</button></div></div>}
    </div>
  );
}