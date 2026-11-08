import assert from "node:assert/strict";
import { env } from "../../config/env.js";

import {
    encryptVaultContent,
    decryptVaultContent,
    rewrapKekEncryptedDek,
} from "./encryption.service.js";

const vaultId = "vault-test-001";
const content = "This is a confidential VaultShare secret.";

const encrypted = encryptVaultContent(vaultId, content);

// 1. Normal encryption and decryption
const decrypted = decryptVaultContent(vaultId, encrypted);

assert.equal(decrypted, content);
console.log("PASS: Encryption and decryption");

// 2. Different vault ID must fail
assert.throws(() => {
    decryptVaultContent("different-vault-id", encrypted);
});

console.log("PASS: Vault ID isolation");

// Helper to modify encrypted bytes
function tamperBase64(value: string): string {
    const bytes = Buffer.from(value, "base64");
    bytes[0] = bytes[0]! ^ 1;
    return bytes.toString("base64");
}

// 3. Modified ciphertext must fail authentication
assert.throws(() => {
    decryptVaultContent(vaultId, {
        ...encrypted,
        encryptedContent: tamperBase64(encrypted.encryptedContent),
    });
});

console.log("PASS: Content tampering detection");

// 4. Modified wrapped DEK must fail authentication
assert.throws(() => {
    decryptVaultContent(vaultId, {
        ...encrypted,
        encryptedDek: tamperBase64(encrypted.encryptedDek),
    });
});

console.log("PASS: Wrapped DEK tampering detection");

// 5. Each encryption must generate a different DEK
const secondEncryption = encryptVaultContent(vaultId, content);

assert.notEqual(
    encrypted.encryptedDek,
    secondEncryption.encryptedDek,
);

console.log("PASS: Unique DEK generation");

// 6. Versioned KEK rewrapping preserves ciphertext and plaintext.
if (env.VAULT_KEK_V2_BASE64) {
    const rotatedDek = rewrapKekEncryptedDek(vaultId, encrypted.encryptedDek, 1, 2);
    assert.equal(decryptVaultContent(vaultId, { ...encrypted, encryptedDek: rotatedDek, kekVersion: 2 }), content);
    assert.throws(() => decryptVaultContent(vaultId, { ...encrypted, encryptedDek: rotatedDek, kekVersion: 1 }));
    console.log("PASS: KEK v1-to-v2 rewrap and version enforcement");
} else {
    console.log("SKIP: KEK rotation test (VAULT_KEK_V2_BASE64 is not configured)");
}

console.log("\nAll encryption tests passed.");