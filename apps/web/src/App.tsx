import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  time: string;
}

export function App() {
  const [tokens, setTokens] = createSignal<TokenState[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal('');
  let nextMessageId = 1;
  let chatContainer: HTMLDivElement | undefined;

  onMount(() => {
    const unsubscribe = engine.onUpdate((updatedTokens) => {
      setTokens(updatedTokens);
    });

    engine.addToken({
      id: 'hero-1',
      position: { x: 100, y: 200 },
      rotation: 0,
      hidden: false,
      conditions: [],
      hp: 45,
      maxHp: 52,
      ownerId: 'player-1',
      lockedBy: null,
    });

    engine.addToken({
      id: 'goblin-1',
      position: { x: 300, y: 250 },
      rotation: 180,
      hidden: false,
      conditions: [],
      hp: 7,
      maxHp: 7,
      ownerId: null,
      lockedBy: null,
    });

    engine.addToken({
      id: 'goblin-2',
      position: { x: 320, y: 220 },
      rotation: 90,
      hidden: false,
      conditions: ['poisoned'],
      hp: 3,
      maxHp: 7,
      ownerId: null,
      lockedBy: null,
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
    setActiveIndex((prev) => (prev + 1) % tokens().length);
  };

  const selectToken = (index: number) => {
    setActiveIndex(index);
  };

  const activeToken = () => tokens()[activeIndex()];

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
              {tokens().map((token, index) => (
                <li
                  class={`tracker-item ${index === activeIndex() ? 'active' : ''}`}
                  onClick={() => selectToken(index)}
                >
                  <div class="turn-indicator">
                    {index === activeIndex() ? '▶' : ''}
                  </div>

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
            <button class="action-btn damage" onClick={damageActive}>
              ⚔ Урон (5)
            </button>
            <button class="action-btn heal" onClick={healActive}>
              ❤ Лечение (5)
            </button>
          </div>
        </div>

        <div class="right-column">
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