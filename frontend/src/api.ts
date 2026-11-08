import { getSession } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:3000/api/v1";

export type Vault = {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  status: string;
  overallTtlSeconds: number;
  firstSharedAt: string | null;
  expiresAt: string | null;
  expiryPolicy: "DESTROY" | "REVOKE_ACCESS";
  createdAt: string;
  updatedAt: string;
};

export type Folder = { id: string; name: string; createdAt?: string };
export type AuditEvent = { id: string; action: string; method: string; route: string; statusCode: number; createdAt: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  const token = session?.getAccessToken().getJwtToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
  }
  return payload?.data as T;
}

export const api = {
  me: () => request<{ id: string; email: string; emailVerified: boolean }>("/auth/me"),
  listVaults: () => request<Vault[]>("/vaults?limit=100&offset=0"),
  createVault: (input: { name: string; description?: string; content: string; overallTtlSeconds: number; expiryPolicy: "DESTROY" | "REVOKE_ACCESS"; folderId: string | null }) =>
    request<Vault>("/vaults", { method: "POST", body: JSON.stringify(input) }),
  deleteVault: (id: string) => request<void>(`/vaults/${id}`, { method: "DELETE" }),
  revokeVault: (id: string) => request<void>(`/vaults/${id}/revoke`, { method: "POST" }),
  listFolders: () => request<{ folders: Folder[] }>("/folders"),
  createFolder: (name: string) => request<Folder>("/folders", { method: "POST", body: JSON.stringify({ name }) }),
  listAudit: () => request<{ events: AuditEvent[]; limit: number; offset: number }>("/audit-events?limit=25&offset=0"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};
