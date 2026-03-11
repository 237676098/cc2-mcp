/** Bridge protocol types for MCP Server ↔ CC Extension communication */

export type BridgeDomain = 'scene' | 'asset' | 'project' | 'editor';

export interface BridgeRequest {
  id: string;
  type: 'request';
  domain: BridgeDomain;
  method: string;
  params: Record<string, unknown>;
}

export interface BridgeError {
  code: string;
  message: string;
}

export interface BridgeResponse {
  id: string;
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: BridgeError;
}

export type BridgeMessage = BridgeRequest | BridgeResponse;

export const BRIDGE_PORT = 9531;
export const BRIDGE_HOST = '127.0.0.1';
export const DEFAULT_TIMEOUT = 30_000;
export const BUILD_TIMEOUT = 120_000;
export const HEARTBEAT_INTERVAL = 15_000;
export const RECONNECT_BASE_DELAY = 1_000;
export const RECONNECT_MAX_DELAY = 30_000;
