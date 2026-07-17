import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { TokenState } from '@aethel/shared';

export const ydoc = new Y.Doc();
export const ytokens = ydoc.getMap<TokenState>('tokens');
export let syncProvider: WebsocketProvider | null = null;

export function connectToRoom(roomId: string) {
  syncProvider = new WebsocketProvider('ws://localhost:1234', roomId, ydoc, { connect: true });
  syncProvider.on('status', (event: { status: string }) => {
    console.log('[Sync] Статус:', event.status);
  });
  console.log('[Sync] Подключение к комнате:', roomId);
  return ydoc;
}

export function pushTokensToYjs(tokens: TokenState[]) {
  ydoc.transact(() => {
    ytokens.clear();
    tokens.forEach((token) => {
      ytokens.set(token.id, { ...token });
    });
  });
}

export function onYjsChange(callback: (tokens: TokenState[]) => void) {
  const handler = () => {
    const tokens: TokenState[] = [];
    ytokens.forEach((token) => {
      tokens.push({ ...token });
    });
    callback(tokens);
  };
  ytokens.observe(handler);
  return () => ytokens.unobserve(handler);
}