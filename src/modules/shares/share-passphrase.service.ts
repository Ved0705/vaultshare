import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

// 24 random bytes provide 192 bits of entropy. Base64url avoids whitespace
// and characters that are awkward to copy into a share form.
export async function generateSharePassphraseService(vaultId: string, ownerId: string) {
    const [vault] = await db
        .select({ id: vaults.id, status: vaults.status, expiresAt: vaults.expiresAt })
        .from(vaults)
        .where(and(eq(vaults.id, vaultId), eq(vaults.ownerId, ownerId)))
        .limit(1);

    if (!vault) throw new AppError(404, "VAULT_NOT_FOUND", "Vault not found.");
    if (vault.status !== "ACTIVE" || (vault.expiresAt && vault.expiresAt <= new Date())) {
        throw new AppError(409, "VAULT_NOT_SHAREABLE", "Only active, unexpired vaults can have share passphrases generated.");
    }

    return { passphrase: randomBytes(24).toString("base64url"), entropyBits: 192 };
}
