declare module 'y-websocket/bin/utils' {
  import { Doc } from 'yjs';
  import { WebSocket } from 'ws';
  import { IncomingMessage } from 'http';

  export const docs: Map<string, Doc>;

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    options?: { docName?: string; gc?: boolean }
  ): void;
}