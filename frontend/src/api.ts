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
export type VaultDetail = Vault & { content: string };
export type VaultFile = { id: string; originalName: string; mimeType?: string; sizeBytes?: number; createdAt?: string };
export type ShareResult = { id: string; shareCode: string; vaultId: string; readerId: string; permissions: ("READ" | "WRITE")[]; status: string; maxAccessCount: number; successfulOpenCount: number; postOpenTtlSeconds: number | null; sharedAt: string };

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
  getVault: (id: string) => request<VaultDetail>(`/vaults/${id}`),
  updateVault: (id: string, input: { name?: string; description?: string | null; folderId?: string | null }) =>
    request<Vault>(`/vaults/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  listFiles: (vaultId: string) => request<{ files: VaultFile[] }>(`/vaults/${vaultId}/files`),
  uploadFile: async (vaultId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<VaultFile>(`/vaults/${vaultId}/files`, { method: "POST", body });
  },
  deleteFile: (vaultId: string, fileId: string) =>
    request<void>(`/vaults/${vaultId}/files/${fileId}`, { method: "DELETE" }),
  downloadFile: async (vaultId: string, fileId: string) => {
    const session = await getSession();
    const token = session?.getAccessToken().getJwtToken();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`${API_BASE}/vaults/${vaultId}/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || `Download failed (${response.status})`);
    }
    return response.blob();
  },
  generateSharePassphrase: (vaultId: string) =>
    request<{ passphrase: string; entropyBits: number }>(`/vaults/${vaultId}/shares/passphrase`, { method: "POST" }),
  createShare: (vaultId: string, input: { readerId: string; permissions: ("READ" | "WRITE")[]; maxAccessCount: number; postOpenTtlSeconds: number | null; passphrase: string }) =>
    request<ShareResult>(`/vaults/${vaultId}/shares`, { method: "POST", body: JSON.stringify(input) }),
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
