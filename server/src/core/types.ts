export interface RpcRequest {
  id: number;
  action: string;
  payload?: unknown;
}

export type RpcResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RpcResponse<T = unknown> = RpcResult<T> & {
  id: number;
};

export type RpcReply<T = unknown> = RpcResult<T>;


export interface ModuleDefinition {
  name: string;
  prefix: string;
  actions: Record<string, {
    summary: string;
    handler: (payload: unknown) => Promise<unknown> | unknown;
  }>;
}

export interface ModuleManifest {
  name: string;
  prefix: string;
  actions: Array<{ action: string; summary: string }>;
}

export interface HealthReport {
  module: string;
  healthy: boolean;
  detail?: string;
}
