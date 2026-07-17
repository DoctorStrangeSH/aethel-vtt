import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';

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
  const [tokens, setTokens] = createSignal<TokenState[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal('');
  const [spellName, setSpellName] = createSignal('');
  const [spellResult, setSpellResult] = createSignal<SpellResult | null>(null);
  const [spellLoading, setSpellLoading] = createSignal(false);
  const [spellError, setSpellError] = createSignal('');
  const [showCompendium, setShowCompendium] = createSignal(false);
  let nextMessageId = 1;
  let chatContainer: HTMLDivElement | undefined;

  onMount(() => {
    const unsubscribe = engine.onUpdate((updatedTokens) => {
      setTokens(updatedTokens);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  const hpPercent = (token: TokenState) => {
    return Math.round((token.hp / token.maxHp) * 100);
  };

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

  const selectToken = (index: number) => {
    setActiveIndex(index);
  };

  const activeToken = () => {
    const list = tokens();
    if (list.length === 0) return undefined;
    return list[activeIndex()];
  };

  const damageActive = () => {
    const token = activeToken();
    if (token) {
      engine.damageToken(token.id, 5);
    }
  };

  const healActive = () => {
    const token = activeToken();
    if (token) {
      engine.healToken(token.id, 5);
    }
  };

  const sendMessage = () => {
    const text = inputText().trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setMessages((prev) => [
      ...prev,
      { id: nextMessageId++, sender: 'DM', text, time },
    ]);
    setInputText('');

    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  };

  const rollDice = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId++,
        sender: '🎲',
        text: `Бросок 1d${sides}: ${result}`,
        time,
      },
    ]);

    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  };

  const addRandomToken = () => {
    const names = ['Гоблин', 'Орк', 'Скелет', 'Волк', 'Бандит', 'Зомби', 'Крыса'];
    const name = names[Math.floor(Math.random() * names.length)];
    const id = `${name.toLowerCase()}-${Date.now()}`;
    const hp = Math.floor(Math.random() * 20) + 5;

    engine.addToken({
      id,
      position: { x: 0, y: 0 },
      rotation: 0,
      hidden: false,
      conditions: [],
      hp,
      maxHp: hp,
      ownerId: null,
      lockedBy: null,
    });
  };

  const searchSpell = async () => {
    const name = spellName().trim();
    if (!name) return;

    setSpellLoading(true);
    setSpellError('');
    setSpellResult(null);

    try {
      const response = await fetch(`https://www.dnd5eapi.co/api/spells/${name.toLowerCase().replace(/ /g, '-')}`);

      if (!response.ok) {
        setSpellError('Заклинание не найдено');
        setSpellLoading(false);
        return;
      }

      const data = await response.json();

      setSpellResult({
        name: data.name,
        level: data.level,
        school: data.school?.name || 'Неизвестно',
        casting_time: data.casting_time || '—',
        range: data.range || '—',
        components: data.components || [],
        duration: data.duration || '—',
        description: data.desc?.join('\n') || 'Нет описания',
      });
    } catch {
      setSpellError('Ошибка соединения с API');
    }

    setSpellLoading(false);
  };

  const handleSpellKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchSpell();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div class="app">
      <h1>Aethel VTT</h1>

      <div class="layout">
        <div class="left-column">
          <div class="tracker">
            <div class="tracker-header">
              <h2 class="tracker-title">Combat Tracker</h2>
              <button class="next-turn-btn" onClick={nextTurn}>
                Следующий ход →
              </button>
            </div>

            <ul class="tracker-list">
              {tokens().length === 0 && (
                <li class="tracker-empty">Нет токенов. Добавьте первого бойца.</li>
              )}
              {tokens().map((token, index) => (
                <li
                  class={`tracker-item ${index === activeIndex() ? 'active' : ''}`}
                  onClick={() => selectToken(index)}
                >
                  <div class="turn-indicator">
                    {index === activeIndex() ? '▶' : ''}
                  </div>

                  <button
                    class="token-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.removeToken(token.id);
                    }}
                    title="Удалить токен"
                  >
                    ✕
                  </button>

                  <div class="token-icon">
                    <div class="icon-placeholder" />
                  </div>

                  <div class="token-info">
                    <span class="token-name">{token.id}</span>
                    {token.conditions.length > 0 && (
                      <span class="token-conditions">
                        {token.conditions.join(', ')}
                      </span>
                    )}
                  </div>

                  <div class="token-hp-bar">
                    <div
                      class="token-hp-fill"
                      style={{
                        width: `${hpPercent(token)}%`,
                        'background-color': hpColor(token),
                      }}
                    />
                  </div>

                  <span class="token-hp-text">
                    {token.hp} / {token.maxHp}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div class="actions">
            <button class="action-btn add" onClick={addRandomToken}>
              ＋ Добавить токен
            </button>
            <button class="action-btn damage" onClick={damageActive}>
              ⚔ Урон (5)
            </button>
            <button class="action-btn heal" onClick={healActive}>
              ❤ Лечение (5)
            </button>
          </div>
        </div>

        <div class="right-column">
          {/* Компендиум */}
          <div class="compendium">
            <div class="compendium-header">
              <h2 class="compendium-title">📖 Заклинания</h2>
              <button
                class="compendium-toggle"
                onClick={() => setShowCompendium(!showCompendium())}
              >
                {showCompendium() ? 'Скрыть' : 'Поиск'}
              </button>
            </div>

            {showCompendium() && (
              <div class="compendium-body">
                <div class="compendium-search">
                  <input
                    class="compendium-input"
                    type="text"
                    placeholder="Название заклинания (на англ.)..."
                    value={spellName()}
                    onInput={(e) => setSpellName(e.currentTarget.value)}
                    onKeyDown={handleSpellKeyDown}
                  />
                  <button class="compendium-search-btn" onClick={searchSpell}>
                    🔍
                  </button>
                </div>

                {spellLoading() && <p class="compendium-status">Поиск...</p>}
                {spellError() && <p class="compendium-error">{spellError()}</p>}

                {spellResult() && (
                  <div class="spell-card">
                    <h3 class="spell-name">{spellResult()!.name}</h3>
                    <p class="spell-meta">
                      Уровень {spellResult()!.level} • {spellResult()!.school}
                    </p>
                    <p class="spell-detail">⏱ {spellResult()!.casting_time}</p>
                    <p class="spell-detail">📏 {spellResult()!.range}</p>
                    <p class="spell-detail">
                      🧪 {spellResult()!.components.join(', ') || '—'}
                    </p>
                    <p class="spell-detail">⏳ {spellResult()!.duration}</p>
                    <p class="spell-desc">{spellResult()!.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Чат */}
          <div class="chat">
            <h2 class="chat-title">Чат</h2>

            <div
              class="chat-messages"
              ref={(el) => (chatContainer = el)}
            >
              {messages().length === 0 && (
                <p class="chat-empty">Сообщений пока нет</p>
              )}
              {messages().map((msg) => (
                <div class="chat-message">
                  <span class="chat-sender">{msg.sender}</span>
                  <span class="chat-time">{msg.time}</span>
                  <p class="chat-text">{msg.text}</p>
                </div>
              ))}
            </div>

            <div class="chat-dice">
              <button class="dice-btn" onClick={() => rollDice(20)}>
                🎲 d20
              </button>
              <button class="dice-btn" onClick={() => rollDice(6)}>
                🎲 d6
              </button>
              <button class="dice-btn" onClick={() => rollDice(8)}>
                🎲 d8
              </button>
            </div>

            <div class="chat-input-area">
              <input
                class="chat-input"
                type="text"
                placeholder="Введите сообщение..."
                value={inputText()}
                onInput={(e) => setInputText(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
              <button class="chat-send-btn" onClick={sendMessage}>
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}