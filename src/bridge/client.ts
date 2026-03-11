import WebSocket from 'ws';
import {
  BridgeRequest,
  BridgeResponse,
  BridgeDomain,
  BRIDGE_PORT,
  BRIDGE_HOST,
  DEFAULT_TIMEOUT,
  HEARTBEAT_INTERVAL,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
} from './protocol.js';
import { RequestQueue } from './queue.js';

export class BridgeClient {
  private ws: WebSocket | null = null;
  private queue = new RequestQueue();
  private reconnectDelay = RECONNECT_BASE_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.intentionalClose = false;
    this._doConnect();
  }

  private _doConnect(): void {
    const url = `ws://${BRIDGE_HOST}:${BRIDGE_PORT}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this._connected = true;
      this.reconnectDelay = RECONNECT_BASE_DELAY;
      this._startHeartbeat();
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg: BridgeResponse = JSON.parse(raw.toString());
        if (msg.type === 'response') {
          this.queue.handleResponse(msg);
        }
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this._onDisconnect();
    });

    this.ws.on('error', () => {
      // error is followed by close, handled there
    });
  }

  private _onDisconnect(): void {
    this._connected = false;
    this._stopHeartbeat();
    if (!this.intentionalClose) {
      this.queue.rejectAll('Bridge connection lost');
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_DELAY);
      this._doConnect();
    }, this.reconnectDelay);
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async send(domain: BridgeDomain, method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Cocos Creator editor. Is the editor running with cc2-mcp-bridge extension?');
    }

    const { id, promise } = this.queue.createRequest(timeoutMs ?? DEFAULT_TIMEOUT);
    const request: BridgeRequest = { id, type: 'request', domain, method, params };
    this.ws.send(JSON.stringify(request));
    return promise;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopHeartbeat();
    this.queue.rejectAll('Bridge client disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
