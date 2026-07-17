import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';

export function App() {
  const [tokens, setTokens] = createSignal<TokenState[]>([]);

  onMount(() => {
    const unsubscribe = engine.onUpdate((updatedTokens) => {
      setTokens(updatedTokens);
    });

    // Добавляем тестовые токены
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

  return (
    <div class="app">
      <h1>Aethel VTT</h1>

      <div class="tracker">
        <h2 class="tracker-title">Combat Tracker</h2>

        <ul class="tracker-list">
          {tokens().map((token) => (
            <li class="tracker-item">
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
    </div>
  );
}