import { TokenState, Vector2 } from '@aethel/shared';

export class GameEngine {
  private tokens: Map<string, TokenState> = new Map();
  private onUpdateCallbacks: Array<(tokens: TokenState[]) => void> = [];

  constructor() {
    console.log('[Aethel Engine] Инициализация завершена');
  }

  addToken(token: TokenState): void {
    this.tokens.set(token.id, { ...token });
    this.notify();
  }

  removeToken(id: string): void {
    this.tokens.delete(id);
    this.notify();
  }

  moveToken(id: string, position: Vector2): void {
    const token = this.tokens.get(id);
    if (token && !token.lockedBy) {
      token.position = { ...position };
      this.notify();
    }
  }

  getTokens(): TokenState[] {
    return Array.from(this.tokens.values());
  }

  getToken(id: string): TokenState | undefined {
    return this.tokens.get(id);
  }

  onUpdate(callback: (tokens: TokenState[]) => void): () => void {
    this.onUpdateCallbacks.push(callback);
    return () => {
      this.onUpdateCallbacks = this.onUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  private notify(): void {
    const tokens = this.getTokens();
    this.onUpdateCallbacks.forEach(cb => cb(tokens));
  }
}

export const engine = new GameEngine();