import { WebSocketServer } from 'ws';
import { setupWSConnection, docs } from 'y-websocket/bin/utils';

const PORT = 1234;

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const roomName = url.searchParams.get('room') || 'default';
  setupWSConnection(ws, req, { docName: roomName, gc: true });
});

console.log(`[Signaling] Yjs WebSocket сервер запущен на ws://localhost:${PORT}`);