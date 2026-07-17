import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';
import { supabase, subscribeToCampaign, saveCampaign, loginWithGitHub, loginWithEmail, registerWithEmail, logoutUser, onUserChanged, uploadMap } from './supabase';

interface ChatMessage { id: number; sender: string; text: string; time: string; }
interface SpellResult { name: string; level: number; school: string; casting_time: string; range: string; components: string[]; duration: string; description: string; }

export function App() {
  const [user, setUser] = createSignal<{ login: string; avatar_url: string } | null>(null);
  const [tokens, setTokens] = createSignal<TokenState[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal('');
  const [spellName, setSpellName] = createSignal('');
  const [spellResult, setSpellResult] = createSignal<SpellResult | null>(null);
  const [spellLoading, setSpellLoading] = createSignal(false);
  const [spellError, setSpellError] = createSignal('');
  const [showCompendium, setShowCompendium] = createSignal(false);
  const [authMode, setAuthMode] = createSignal<'login' | 'register' | null>(null);
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [authMsg, setAuthMsg] = createSignal('');
  const [authIsError, setAuthIsError] = createSignal(false);
  const [mapUrl, setMapUrl] = createSignal<string | null>(null);
  let chatContainer: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let isDragging = false;
  let dragTokenId: string | null = null;
  let isLocalChange = false;
  const CANVAS_W = 600;
  const CANVAS_H = 400;

  const saveToFirebase = () => {
    isLocalChange = true;
    saveCampaign({ tokens: engine.getTokens(), messages: messages() });
    setTimeout(() => { isLocalChange = false; }, 500);
  };

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthMsg('');
    setAuthIsError(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  const closeAuth = () => setAuthMode(null);

  const handleEmailAuth = async () => {
    setAuthMsg(''); setAuthIsError(false);
    const pass = password();
    if (pass.length < 6) { setAuthMsg('Минимум 6 символов'); setAuthIsError(true); return; }
    try {
      if (authMode() === 'register') {
        const name = displayName().trim();
        const { error } = await registerWithEmail(email(), password(), name || undefined);
        if (error) {
          setAuthMsg(error.message.includes('already') ? 'Почта уже занята' : error.message);
          setAuthIsError(true);
        } else {
          setAuthMsg('✅ Проверьте почту для подтверждения');
          setAuthIsError(false);
        }
      } else {
        const { error } = await loginWithEmail(email(), password());
        if (error) {
          if (error.message.includes('Invalid')) setAuthMsg('Неверная почта или пароль');
          else if (error.message.includes('not confirmed')) setAuthMsg('Почта не подтверждена');
          else setAuthMsg(error.message);
          setAuthIsError(true);
        } else { closeAuth(); }
      }
    } catch (e: any) { setAuthMsg(e.message || 'Ошибка'); setAuthIsError(true); }
  };

  const handleMapUpload = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    try { const url = await uploadMap(f); setMapUrl(url); drawCanvas(); } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser({ login: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'Игрок', avatar_url: data.session.user.user_metadata?.avatar_url || '' });
    });
    const u1 = onUserChanged((u) => setUser(u ? { login: u.name || u.email || 'Игрок', avatar_url: u.avatar || '' } : null));
    const u2 = subscribeToCampaign((data) => {
      if (isLocalChange) return;
      if (data) { engine.loadTokens(data.tokens as TokenState[] || []); setTokens(data.tokens as TokenState[] || []); setMessages(data.messages as ChatMessage[] || []); drawCanvas(); }
      else { engine.addToken({ id: 'hero-1', position: { x: 200, y: 200 }, rotation: 0, hidden: false, conditions: [], hp: 45, maxHp: 52, ownerId: 'player-1', lockedBy: null }); engine.addToken({ id: 'goblin-1', position: { x: 400, y: 150 }, rotation: 0, hidden: false, conditions: [], hp: 7, maxHp: 7, ownerId: null, lockedBy: null }); saveToFirebase(); }
    });
    const u3 = engine.onUpdate(() => { setTokens(engine.getTokens()); drawCanvas(); saveToFirebase(); });
    onCleanup(() => { u1(); u2(); u3(); });
  });

  const drawCanvas = () => {
    const c = canvasRef; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const map = mapUrl(); if (map) { const img = new Image(); img.src = map; if (img.complete) ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); else { img.onload = () => { ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); drawCanvas(); }; return; } }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
    for (let y = 0; y < CANVAS_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }
    engine.getTokens().forEach(t => {
      const { x, y } = t.position;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fillStyle = t.ownerId ? '#4ecca3' : '#e94560'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(t.id, x, y + 30);
      const pct = t.hp / t.maxHp; const bw = 36, bh = 4; const bx = x - bw / 2, by = y - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#4ecca3' : pct > 0.25 ? '#f0a500' : '#e94560'; ctx.fillRect(bx, by, bw * pct, bh);
    });
  };

  const toLocal = (cx: number, cy: number) => { const r = canvasRef?.getBoundingClientRect(); if (!r) return { x: 0, y: 0 }; return { x: (cx - r.left) * CANVAS_W / r.width, y: (cy - r.top) * CANVAS_H / r.height }; };
  const getTokenAt = (mx: number, my: number) => engine.getTokens().find(t => Math.hypot(t.position.x - mx, t.position.y - my) < 24);
  const onMD = (e: MouseEvent) => { const { x, y } = toLocal(e.clientX, e.clientY); const t = getTokenAt(x, y); if (t) { isDragging = true; dragTokenId = t.id; } };
  const onMM = (e: MouseEvent) => { if (!isDragging || !dragTokenId) return; const { x, y } = toLocal(e.clientX, e.clientY); engine.moveToken(dragTokenId, { x: Math.max(20, Math.min(CANVAS_W - 20, x)), y: Math.max(20, Math.min(CANVAS_H - 20, y)) }); };
  const onMU = () => { isDragging = false; dragTokenId = null; };
  const onDbl = (e: MouseEvent) => { const { x, y } = toLocal(e.clientX, e.clientY); const t = getTokenAt(x, y); if (t) { const i = engine.getTokens().findIndex(tk => tk.id === t.id); if (i >= 0) setActiveIndex(i); } };

  const hpPct = (t: TokenState) => Math.round(t.hp / t.maxHp * 100);
  const hpCol = (t: TokenState) => { const p = hpPct(t); return p > 50 ? '#4ecca3' : p > 25 ? '#f0a500' : '#e94560'; };

  const searchSpell = async () => {
    const name = spellName().trim(); if (!name) return;
    setSpellLoading(true); setSpellError(''); setSpellResult(null);
    try {
      const r = await fetch(`https://www.dnd5eapi.co/api/spells/${name.toLowerCase().replace(/ /g, '-')}`);
      if (!r.ok) { setSpellError('Заклинание не найдено'); setSpellLoading(false); return; }
      const d = await r.json();
      setSpellResult({ name: d.name, level: d.level, school: d.school?.name || 'Неизвестно', casting_time: d.casting_time || '—', range: d.range || '—', components: d.components || [], duration: d.duration || '—', description: d.desc?.join('\n') || 'Нет описания' });
    } catch { setSpellError('Ошибка соединения с API'); }
    setSpellLoading(false);
  };

  const at = () => { const l = tokens(); return l.length === 0 ? undefined : l[activeIndex()]; };

  return (
    <div class="app">
      <h1>Aethel VTT</h1>
      <div class="user-bar">
        {user() ? (
          <div class="user-info">
            <img class="user-avatar" src={user()!.avatar_url || ''} alt="" />
            <span class="user-name">{user()!.login}</span>
            <button class="btn btn-ghost" onClick={() => { logoutUser(); setUser(null); }}>Выйти</button>
          </div>
        ) : (
          <div class="auth-buttons">
            <button class="btn btn-ghost" onClick={() => openAuth('login')}>Войти</button>
            <button class="btn btn-primary" onClick={() => openAuth('register')}>Регистрация</button>
          </div>
        )}
      </div>

      {authMode() && (
        <div class="modal-overlay" onClick={closeAuth}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{authMode() === 'login' ? 'Вход' : 'Регистрация'}</h3>

            {authMsg() && <div class={`auth-msg ${authIsError() ? 'auth-err' : 'auth-ok'}`}>{authMsg()}</div>}

            <form onSubmit={(e) => { e.preventDefault(); handleEmailAuth(); }}>
              {authMode() === 'register' && (
                <input class="input" type="text" placeholder="Ваше имя" value={displayName()} onInput={(e) => setDisplayName(e.currentTarget.value)} autocomplete="username" />
              )}
              <input class="input" type="email" placeholder="Email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="email" />
              <input class="input" type="password" placeholder="Пароль" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} minlength="6" />
              <button class="btn btn-primary" type="submit" style="width:100%">{authMode() === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
            </form>

            <div class="auth-sep">или</div>
            <button class="btn btn-github" onClick={loginWithGitHub}>🐙 Войти через GitHub</button>

            <p class="auth-switch">
              {authMode() === 'login' ? (
                <>Нет аккаунта? <span onClick={() => openAuth('register')}>Зарегистрироваться</span></>
              ) : (
                <>Уже есть аккаунт? <span onClick={() => openAuth('login')}>Войти</span></>
              )}
            </p>
          </div>
        </div>
      )}

      <div class="layout">
        <div class="left-column">
          <div class="map-controls">
            <label class="btn btn-ghost" style="cursor:pointer">🗺 Карта<input type="file" accept="image/*" onChange={handleMapUpload} hidden /></label>
            {mapUrl() && <button class="btn btn-ghost" onClick={() => { setMapUrl(null); drawCanvas(); }}>✕</button>}
          </div>
          <div class="minimap-container">
            <canvas ref={(el) => (canvasRef = el)} width={CANVAS_W} height={CANVAS_H} class="minimap-canvas" onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onDblClick={onDbl} />
          </div>
          <div class="tracker">
            <div class="tracker-header"><h2 class="tracker-title">Combat Tracker</h2><button class="btn btn-ghost" onClick={() => { const l = tokens(); if (l.length) setActiveIndex(p => (p + 1) % l.length); }}>→</button></div>
            <ul class="tracker-list">
              {tokens().length === 0 && <li class="tracker-empty">Нет токенов</li>}
              {tokens().map((t, i) => (
                <li class={`tracker-item ${i === activeIndex() ? 'active' : ''}`} onClick={() => setActiveIndex(i)}>
                  <div class="turn-indicator">{i === activeIndex() ? '▶' : ''}</div>
                  <button class="token-remove" onClick={(e) => { e.stopPropagation(); engine.removeToken(t.id); }}>✕</button>
                  <div class="token-icon"><div class="icon-placeholder" /></div>
                  <div class="token-info"><span class="token-name">{t.id}</span>{t.conditions.length > 0 && <span class="token-conditions">{t.conditions.join(', ')}</span>}</div>
                  <div class="token-hp-bar"><div class="token-hp-fill" style={{ width: `${hpPct(t)}%`, 'background-color': hpCol(t) }} /></div>
                  <span class="token-hp-text">{t.hp} / {t.maxHp}</span>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button class="btn btn-ghost" onClick={() => { const n = ['Гоблин','Орк','Скелет','Волк','Бандит','Зомби','Крыса'][Math.random()*7|0]; const hp = Math.random()*20+5|0; engine.addToken({ id: `${n.toLowerCase()}-${Date.now()}`, position: { x: 100+Math.random()*400, y: 100+Math.random()*200 }, rotation:0, hidden:false, conditions:[], hp, maxHp: hp, ownerId:null, lockedBy:null }); }}>＋ Токен</button>
            <button class="btn btn-danger" onClick={() => { const t = at(); if (t) engine.damageToken(t.id, 5); }}>⚔ Урон</button>
            <button class="btn btn-heal" onClick={() => { const t = at(); if (t) engine.healToken(t.id, 5); }}>❤ Лечение</button>
          </div>
        </div>
        <div class="right-column">
          <div class="compendium">
            <div class="compendium-header"><h2 class="compendium-title">📖 Заклинания</h2><button class="btn btn-ghost" onClick={() => setShowCompendium(!showCompendium())}>{showCompendium() ? 'Скрыть' : 'Поиск'}</button></div>
            {showCompendium() && (
              <div class="compendium-body">
                <div class="compendium-search"><input class="input" type="text" placeholder="Fireball, sleep..." value={spellName()} onInput={(e) => setSpellName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key==='Enter') { e.preventDefault(); searchSpell(); }}} /><button class="btn btn-primary" onClick={searchSpell}>🔍</button></div>
                {spellLoading() && <p class="compendium-status">Поиск...</p>}
                {spellError() && <p class="compendium-error">{spellError()}</p>}
                {spellResult() && (
                  <div class="spell-card"><h3 class="spell-name">{spellResult()!.name}</h3><p class="spell-meta">Ур. {spellResult()!.level} • {spellResult()!.school}</p><p class="spell-detail">⏱ {spellResult()!.casting_time}</p><p class="spell-detail">📏 {spellResult()!.range}</p><p class="spell-detail">🧪 {spellResult()!.components.join(', ') || '—'}</p><p class="spell-detail">⏳ {spellResult()!.duration}</p><p class="spell-desc">{spellResult()!.description}</p></div>
                )}
              </div>
            )}
          </div>
          <div class="chat">
            <h2 class="chat-title">Чат</h2>
            <div class="chat-messages" ref={(el) => (chatContainer = el)}>
              {messages().length === 0 && <p class="chat-empty">Нет сообщений</p>}
              {messages().map(m => (<div class="chat-message"><span class="chat-sender">{m.sender}</span><span class="chat-time">{m.time}</span><p class="chat-text">{m.text}</p></div>))}
            </div>
            <div class="chat-dice">
              {[20,6,8].map(s => <button class="dice-btn" onClick={() => { const r = Math.random()*s+1|0; const now = new Date(); const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`; setMessages(p => [...p, { id: Date.now(), sender: '🎲', text: `1d${s}: ${r}`, time: t }]); saveToFirebase(); }}>🎲 d{s}</button>)}
            </div>
            <div class="chat-input-area">
              <input class="chat-input" type="text" placeholder="Сообщение..." value={inputText()} onInput={(e) => setInputText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); const tx = inputText().trim(); if (!tx) return; const now = new Date(); setMessages(p => [...p, { id: Date.now(), sender: user()?.login || 'Аноним', text: tx, time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` }]); setInputText(''); saveToFirebase(); }}} />
              <button class="chat-send-btn" onClick={() => { const tx = inputText().trim(); if (!tx) return; const now = new Date(); setMessages(p => [...p, { id: Date.now(), sender: user()?.login || 'Аноним', text: tx, time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` }]); setInputText(''); saveToFirebase(); }}>→</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}