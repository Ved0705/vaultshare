export type VaultPermission = "READ" | "WRITE";

export interface VaultAccess {
    canRead: boolean;
    canWrite: boolean;
}

export function getVaultAccess(
    permissions: VaultPermission[],
): VaultAccess {
    return {
        canRead: permissions.includes("READ"),
        canWrite: permissions.includes("WRITE"),
    };
}

export function requireVaultPermission(
    permissions: VaultPermission[],
    required: VaultPermission,
): boolean {
    return permissions.includes(required);
}