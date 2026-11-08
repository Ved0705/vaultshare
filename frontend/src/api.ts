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
export type OpenedShare = { shareId: string; shareCode: string; permissions: ("READ" | "WRITE")[]; successfulOpenCount: number; remainingAccesses: number; content?: string; canRequestWrite: boolean; postOpenExpiresAt: string | null; vaultExpiresAt: string | null };
export type SharedVaultFile = { id: string; originalName: string; mimeType?: string; sizeBytes?: number; createdAt?: string };
export type OwnerAccessRequest = { id: string; requesterId: string; requesterEmail: string; message: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; requestedAt: string; reviewedAt: string | null; responseMessage: string | null };
export type OwnerWriteRequest = { id: string; shareId: string; requestedBy: string; status: "PENDING" | "APPROVED" | "REJECTED"; requestedAt: string; reviewedAt: string | null };
export type WriteRequestDetail = { id: string; status: string; requestedBy: string; proposedContent: string; requestedAt: string; reviewedAt: string | null };

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
  openShare: (shareCode: string, passphrase: string) =>
    request<OpenedShare>(`/shares/${encodeURIComponent(shareCode)}/open`, { method: "POST", body: JSON.stringify({ passphrase }) }),
  createWriteRequest: (shareCode: string, input: { proposedContent: string; passphrase: string }) =>
    request<{ id: string; status: string; requestedAt: string }>(`/shares/${encodeURIComponent(shareCode)}/write-requests`, { method: "POST", body: JSON.stringify(input) }),
  listSharedFiles: (shareCode: string, passphrase: string) =>
    request<{ files: SharedVaultFile[] }>(`/shares/${encodeURIComponent(shareCode)}/files/list`, { method: "POST", body: JSON.stringify({ passphrase }) }),
  downloadSharedFile: async (shareCode: string, fileId: string, passphrase: string) => {
    const session = await getSession();
    const token = session?.getAccessToken().getJwtToken();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`${API_BASE}/shares/${encodeURIComponent(shareCode)}/files/${encodeURIComponent(fileId)}/download`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ passphrase }),
    });
    if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error?.message || `Download failed (${response.status})`); }
    return response.blob();
  },
  requestVaultAccess: (vaultId: string, message?: string) =>
    request<{ request: { id: string; status: string; requestedAt: string } }>(`/access-requests/vaults/${vaultId}`, { method: "POST", body: JSON.stringify({ message }) }),
  cancelAccessRequest: (requestId: string) =>
    request<{ request: { id: string; status: string; cancelledAt: string } }>(`/access-requests/${requestId}/cancel`, { method: "PATCH" }),
  listOwnerAccessRequests: (vaultId: string) =>
    request<{ requests: OwnerAccessRequest[] }>(`/vaults/${vaultId}/access-requests`),
  reviewAccessRequest: (vaultId: string, requestId: string, decision: "APPROVE" | "REJECT", responseMessage?: string) =>
    request<{ request: { id: string; status: string; reviewedAt: string | null; responseMessage: string | null } }>(`/vaults/${vaultId}/access-requests/${requestId}/review`, { method: "PATCH", body: JSON.stringify({ decision, responseMessage }) }),
  listOwnerWriteRequests: (vaultId: string) =>
    request<{ requests: OwnerWriteRequest[] }>(`/vaults/${vaultId}/write-requests?limit=100&offset=0`),
  getOwnerWriteRequest: (vaultId: string, requestId: string) =>
    request<WriteRequestDetail>(`/vaults/${vaultId}/write-requests/${requestId}`),
  reviewWriteRequest: (vaultId: string, requestId: string, decision: "APPROVE" | "REJECT") =>
    request<{ requestId: string; status: string; derivedVault?: { id: string; name: string }; reviewedAt: string }>(`/vaults/${vaultId}/write-requests/${requestId}/review`, { method: "POST", body: JSON.stringify({ decision }) }),
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
