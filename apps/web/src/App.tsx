import { createSignal, onCleanup, onMount } from 'solid-js';
import { engine } from '@aethel/engine';
import type { TokenState } from '@aethel/shared';

export function App() {
  const [tokens, setTokens] = createSignal<TokenState[]>([]);
  const [count, setCount] = createSignal(0);

  onMount(() => {
    // Подписываемся на обновления движка
    const unsubscribe = engine.onUpdate((updatedTokens) => {
      setTokens(updatedTokens);
    });

    // Добавляем тестовый токен
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

    onCleanup(() => {
      unsubscribe();
    });
  });

  const handleClick = () => {
    setCount(count() + 1);
  };

  return (
    <div class="app">
      <h1>Aethel VTT</h1>
      <p>Токенов на сцене: {tokens().length}</p>
      <p>Счётчик кликов: {count()}</p>
      <button onClick={handleClick}>Нажми меня</button>
    </div>
  );
}