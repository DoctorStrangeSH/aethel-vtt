import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';
import { supabase, subscribeToCampaign, saveCampaign, loginWithGitHub, loginWithEmail, registerWithEmail, logoutUser, onUserChanged, uploadMap } from './supabase';

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  time: string;
}

interface SpellResult {
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string[];
  duration: string;
  description: string;
}

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
  const [showEmailForm, setShowEmailForm] = createSignal(false);
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [isRegister, setIsRegister] = createSignal(false);
  const [authMessage, setAuthMessage] = createSignal('');
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
    saveCampaign({
      tokens: engine.getTokens(),
      messages: messages(),
    });
    setTimeout(() => { isLocalChange = false; }, 500);
  };

  const showEmailLogin = () => {
    setShowEmailForm(true);
    setAuthMessage('');
    setAuthIsError(false);
    setEmail('');
    setPassword('');
    setIsRegister(false);
  };

  const showEmailRegister = () => {
    setShowEmailForm(true);
    setAuthMessage('');
    setAuthIsError(false);
    setEmail('');
    setPassword('');
    setIsRegister(true);
  };

  const handleEmailAuth = async () => {
    setAuthMessage('');
    setAuthIsError(false);

    const pass = password();
    if (pass.length < 6) {
      setAuthMessage('Пароль должен быть не менее 6 символов');
      setAuthIsError(true);
      return;
    }

    try {
      if (isRegister()) {
        const { error } = await registerWithEmail(email(), password());
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already exists')) {
            setAuthMessage('Эта почта уже зарегистрирована');
          } else {
            setAuthMessage(error.message);
          }
          setAuthIsError(true);
        } else {
          setAuthMessage('✅ Регистрация успешна! Проверьте почту для подтверждения.');
          setAuthIsError(false);
        }
      } else {
        const { error } = await loginWithEmail(email(), password());
        if (error) {
          if (error.message.includes('Invalid login credentials') || error.message.includes('invalid')) {
            setAuthMessage('Неверная почта или пароль');
          } else if (error.message.includes('Email not confirmed')) {
            setAuthMessage('Почта не подтверждена. Проверьте почтовый ящик.');
          } else {
            setAuthMessage(error.message);
          }
          setAuthIsError(true);
        } else {
          setShowEmailForm(false);
          setAuthMessage('');
        }
      }
    } catch (e: any) {
      setAuthMessage(e.message || 'Произошла ошибка');
      setAuthIsError(true);
    }
  };

  const handleMapUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMap(file);
      setMapUrl(url);
      drawCanvas();
    } catch (err: any) {
      alert('Ошибка загрузки карты: ' + err.message);
    }
  };

  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser({
          login: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'Игрок',
          avatar_url: data.session.user.user_metadata?.avatar_url || '',
        });
      }
    });

    const unsubAuth = onUserChanged((u) => {
      setUser(u ? { login: u.name || u.email || 'Игрок', avatar_url: u.avatar || '' } : null);
    });

    const unsubCampaign = subscribeToCampaign((data) => {
      if (isLocalChange) return;
      if (data) {
        const t = (data.tokens as TokenState[]) || [];
        const m = (data.messages as ChatMessage[]) || [];
        engine.loadTokens(t);
        setTokens(t);
        setMessages(m);
        drawCanvas();
      } else {
        engine.addToken({
          id: 'hero-1', position: { x: 200, y: 200 }, rotation: 0,
          hidden: false, conditions: [], hp: 45, maxHp: 52, ownerId: 'player-1', lockedBy: null,
        });
        engine.addToken({
          id: 'goblin-1', position: { x: 400, y: 150 }, rotation: 0,
          hidden: false, conditions: [], hp: 7, maxHp: 7, ownerId: null, lockedBy: null,
        });
        saveToFirebase();
      }
    });

    const unsubEngine = engine.onUpdate(() => {
      setTokens(engine.getTokens());
      drawCanvas();
      saveToFirebase();
    });

    onCleanup(() => {
      unsubAuth();
      unsubCampaign();
      unsubEngine();
    });
  });

  const drawCanvas = () => {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const map = mapUrl();
    if (map) {
      const img = new Image();
      img.src = map;
      if (img.complete) {
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      } else {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
          drawCanvas();
        };
        return;
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_H);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();
    }

    const list = engine.getTokens();
    list.forEach((token) => {
      const { x, y } = token.position;

      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fillStyle = token.ownerId ? '#4ecca3' : '#e94560';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(token.id, x, y + 30);

      const hpPct = token.hp / token.maxHp;
      const barW = 36;
      const barH = 4;
      const barX = x - barW / 2;
      const barY = y - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#4ecca3' : hpPct > 0.25 ? '#f0a500' : '#e94560';
      ctx.fillRect(barX, barY, barW * hpPct, barH);
    });
  };

  const canvasToLocal = (clientX: number, clientY: number) => {
    const canvas = canvasRef;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const getTokenAt = (mx: number, my: number): TokenState | undefined => {
    const list = engine.getTokens();
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const dx = t.position.x - mx;
      const dy = t.position.y - my;
      if (Math.sqrt(dx * dx + dy * dy) < 24) return t;
    }
    return undefined;
  };

  const handleCanvasMouseDown = (e: MouseEvent) => {
    const { x, y } = canvasToLocal(e.clientX, e.clientY);
    const token = getTokenAt(x, y);
    if (token) {
      isDragging = true;
      dragTokenId = token.id;
    }
  };

  const handleCanvasMouseMove = (e: MouseEvent) => {
    if (!isDragging || !dragTokenId || !canvasRef) return;
    const { x, y } = canvasToLocal(e.clientX, e.clientY);
    const clampedX = Math.max(20, Math.min(CANVAS_W - 20, x));
    const clampedY = Math.max(20, Math.min(CANVAS_H - 20, y));
    engine.moveToken(dragTokenId, { x: clampedX, y: clampedY });
  };

  const handleCanvasMouseUp = () => {
    isDragging = false;
    dragTokenId = null;
  };

  const handleCanvasDoubleClick = (e: MouseEvent) => {
    const { x, y } = canvasToLocal(e.clientX, e.clientY);
    const token = getTokenAt(x, y);
    if (token) {
      const list = engine.getTokens();
      const idx = list.findIndex((t) => t.id === token.id);
      if (idx >= 0) setActiveIndex(idx);
    }
  };

  const hpPercent = (token: TokenState) => Math.round((token.hp / token.maxHp) * 100);
  const hpColor = (token: TokenState) => {
    const pct = hpPercent(token);
    if (pct > 50) return '#4ecca3';
    if (pct > 25) return '#f0a500';
    return '#e94560';
  };

  const nextTurn = () => {
    const list = tokens();
    if (list.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % list.length);
  };
  const selectToken = (index: number) => setActiveIndex(index);
  const activeToken = () => {
    const list = tokens();
    if (list.length === 0) return undefined;
    return list[activeIndex()];
  };
  const damageActive = () => { const t = activeToken(); if (t) engine.damageToken(t.id, 5); };
  const healActive = () => { const t = activeToken(); if (t) engine.healToken(t.id, 5); };

  const sendMessage = () => {
    const text = inputText().trim();
    if (!text) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newMsg = { id: Date.now(), sender: user()?.login || 'Аноним', text, time };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    saveToFirebase();
  };

  const rollDice = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newMsg = { id: Date.now(), sender: '🎲', text: `Бросок 1d${sides}: ${result}`, time };
    setMessages((prev) => [...prev, newMsg]);
    saveToFirebase();
  };

  const addRandomToken = () => {
    const names = ['Гоблин', 'Орк', 'Скелет', 'Волк', 'Бандит', 'Зомби', 'Крыса'];
    const name = names[Math.floor(Math.random() * names.length)];
    const id = `${name.toLowerCase()}-${Date.now()}`;
    const hp = Math.floor(Math.random() * 20) + 5;
    engine.addToken({ id, position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 200 }, rotation: 0, hidden: false, conditions: [], hp, maxHp: hp, ownerId: null, lockedBy: null });
  };

  const searchSpell = async () => {
    const name = spellName().trim();
    if (!name) return;
    setSpellLoading(true); setSpellError(''); setSpellResult(null);
    try {
      const r = await fetch(`https://www.dnd5eapi.co/api/spells/${name.toLowerCase().replace(/ /g, '-')}`);
      if (!r.ok) { setSpellError('Заклинание не найдено'); setSpellLoading(false); return; }
      const d = await r.json();
      setSpellResult({ name: d.name, level: d.level, school: d.school?.name || 'Неизвестно', casting_time: d.casting_time || '—', range: d.range || '—', components: d.components || [], duration: d.duration || '—', description: d.desc?.join('\n') || 'Нет описания' });
    } catch { setSpellError('Ошибка соединения с API'); }
    setSpellLoading(false);
  };

  const handleSpellKeyDown = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); searchSpell(); } };
  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  return (
    <div class="app">
      <h1>Aethel VTT</h1>

      <div class="user-bar">
        {user() ? (
          <div class="user-info">
            <img class="user-avatar" src={user()!.avatar_url || ''} alt="" />
            <span class="user-name">{user()!.login}</span>
            <button class="user-logout" onClick={() => { logoutUser(); setUser(null); }}>Выйти</button>
          </div>
        ) : (
          <div class="auth-buttons">
            <button class="user-login" onClick={loginWithGitHub}>Войти через GitHub</button>
            <button class="user-login" onClick={showEmailRegister}>Регистрация</button>
            <button class="user-login" onClick={showEmailLogin}>Войти по почте</button>
          </div>
        )}
      </div>

      {showEmailForm() && (
        <div class="modal-overlay" onClick={() => setShowEmailForm(false)}>
          <form class="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); handleEmailAuth(); }}>
            <h3>{isRegister() ? 'Регистрация' : 'Вход'}</h3>

            {authMessage() && (
              <div class={`auth-message ${authIsError() ? 'auth-error' : 'auth-success'}`}>
                {authMessage()}
              </div>
            )}

            <input
              class="compendium-input"
              type="email"
              placeholder="Email"
              value={email()}
              onInput={(e) => { setEmail(e.currentTarget.value); setAuthMessage(''); }}
              autocomplete="email"
            />
            <input
              class="compendium-input"
              type="password"
              placeholder="Пароль (минимум 6 символов)"
              value={password()}
              onInput={(e) => { setPassword(e.currentTarget.value); setAuthMessage(''); }}
              autocomplete="current-password"
              minlength="6"
            />
            <button class="action-btn heal" type="submit">
              {isRegister() ? 'Зарегистрироваться' : 'Войти'}
            </button>
            <p class="auth-toggle" onClick={() => { setIsRegister(!isRegister()); setAuthMessage(''); }}>
              {isRegister() ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </p>
          </form>
        </div>
      )}

      <div class="layout">
        <div class="left-column">
          <div class="map-controls">
            <label class="map-upload-btn">
              🗺 Загрузить карту
              <input type="file" accept="image/*" onChange={handleMapUpload} hidden />
            </label>
            {mapUrl() && (
              <button class="map-remove-btn" onClick={() => { setMapUrl(null); drawCanvas(); }}>
                ✕ Убрать карту
              </button>
            )}
          </div>
          <div class="minimap-container">
            <canvas
              ref={(el) => (canvasRef = el)}
              width={CANVAS_W} height={CANVAS_H}
              class="minimap-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onDblClick={handleCanvasDoubleClick}
            />
          </div>
          <div class="tracker">
            <div class="tracker-header">
              <h2 class="tracker-title">Combat Tracker</h2>
              <button class="next-turn-btn" onClick={nextTurn}>Следующий ход →</button>
            </div>
            <ul class="tracker-list">
              {tokens().length === 0 && <li class="tracker-empty">Нет токенов</li>}
              {tokens().map((token, index) => (
                <li class={`tracker-item ${index === activeIndex() ? 'active' : ''}`} onClick={() => selectToken(index)}>
                  <div class="turn-indicator">{index === activeIndex() ? '▶' : ''}</div>
                  <button class="token-remove" onClick={(e) => { e.stopPropagation(); engine.removeToken(token.id); }}>✕</button>
                  <div class="token-icon"><div class="icon-placeholder" /></div>
                  <div class="token-info">
                    <span class="token-name">{token.id}</span>
                    {token.conditions.length > 0 && <span class="token-conditions">{token.conditions.join(', ')}</span>}
                  </div>
                  <div class="token-hp-bar"><div class="token-hp-fill" style={{ width: `${hpPercent(token)}%`, 'background-color': hpColor(token) }} /></div>
                  <span class="token-hp-text">{token.hp} / {token.maxHp}</span>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button class="action-btn add" onClick={addRandomToken}>＋ Добавить токен</button>
            <button class="action-btn damage" onClick={damageActive}>⚔ Урон (5)</button>
            <button class="action-btn heal" onClick={healActive}>❤ Лечение (5)</button>
          </div>
        </div>
        <div class="right-column">
          <div class="compendium">
            <div class="compendium-header">
              <h2 class="compendium-title">📖 Заклинания</h2>
              <button class="compendium-toggle" onClick={() => setShowCompendium(!showCompendium())}>{showCompendium() ? 'Скрыть' : 'Поиск'}</button>
            </div>
            {showCompendium() && (
              <div class="compendium-body">
                <div class="compendium-search">
                  <input class="compendium-input" type="text" placeholder="Название (англ.)..." value={spellName()} onInput={(e) => setSpellName(e.currentTarget.value)} onKeyDown={handleSpellKeyDown} />
                  <button class="compendium-search-btn" onClick={searchSpell}>🔍</button>
                </div>
                {spellLoading() && <p class="compendium-status">Поиск...</p>}
                {spellError() && <p class="compendium-error">{spellError()}</p>}
                {spellResult() && (
                  <div class="spell-card">
                    <h3 class="spell-name">{spellResult()!.name}</h3>
                    <p class="spell-meta">Уровень {spellResult()!.level} • {spellResult()!.school}</p>
                    <p class="spell-detail">⏱ {spellResult()!.casting_time}</p>
                    <p class="spell-detail">📏 {spellResult()!.range}</p>
                    <p class="spell-detail">🧪 {spellResult()!.components.join(', ') || '—'}</p>
                    <p class="spell-detail">⏳ {spellResult()!.duration}</p>
                    <p class="spell-desc">{spellResult()!.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div class="chat">
            <h2 class="chat-title">Чат</h2>
            <div class="chat-messages" ref={(el) => (chatContainer = el)}>
              {messages().length === 0 && <p class="chat-empty">Сообщений пока нет</p>}
              {messages().map((msg) => (
                <div class="chat-message"><span class="chat-sender">{msg.sender}</span><span class="chat-time">{msg.time}</span><p class="chat-text">{msg.text}</p></div>
              ))}
            </div>
            <div class="chat-dice">
              <button class="dice-btn" onClick={() => rollDice(20)}>🎲 d20</button>
              <button class="dice-btn" onClick={() => rollDice(6)}>🎲 d6</button>
              <button class="dice-btn" onClick={() => rollDice(8)}>🎲 d8</button>
            </div>
            <div class="chat-input-area">
              <input class="chat-input" type="text" placeholder="Введите сообщение..." value={inputText()} onInput={(e) => setInputText(e.currentTarget.value)} onKeyDown={handleKeyDown} />
              <button class="chat-send-btn" onClick={sendMessage}>→</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}