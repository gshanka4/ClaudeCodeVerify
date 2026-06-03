import type { CursorWsMessage } from "@architectai/shared";

export type WsHandler = (msg: CursorWsMessage) => void;

export interface WsClientOptions {
  url: string;
  onMessage: WsHandler;
  onDisconnect?: () => void;
  connect?: (url: string) => MockSocket;
}

export interface MockSocket {
  send(data: string): void;
  close(): void;
  simulateMessage(data: string): void;
  readyState: number;
}

const OPEN = 1;

/** Lightweight WS client with reconnect (P7-EC-07). */
export class DriftWsClient {
  private socket: MockSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly opts: WsClientOptions) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private open(): void {
    const factory = this.opts.connect ?? defaultConnect;
    const socket = factory(this.opts.url);
    socket.simulateMessage = (data: string) => {
      try {
        this.opts.onMessage(JSON.parse(data) as CursorWsMessage);
      } catch {
        /* ignore malformed */
      }
    };
    this.socket = socket;
  }

  scheduleReconnect(delayMs = 300): void {
    if (this.closed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.opts.onDisconnect?.();
      this.open();
    }, delayMs);
  }

  pushRaw(data: string): void {
    this.socket?.simulateMessage(data);
  }

  get connected(): boolean {
    return this.socket?.readyState === OPEN;
  }
}

function defaultConnect(_url: string): MockSocket {
  return {
    readyState: OPEN,
    send: () => undefined,
    close() {
      this.readyState = 0;
    },
    simulateMessage: () => undefined,
  };
}
