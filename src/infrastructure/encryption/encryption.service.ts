import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from "node:crypto";

import { env } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

const KEK = Buffer.from(env.VAULT_KEK_BASE64, "base64");

if (KEK.length !== KEY_LENGTH) {
    throw new Error("Invalid KEK length");
}

function encrypt(
    plaintext: Buffer,
    key: Buffer,
    aad: string,
) {
    const nonce = randomBytes(NONCE_LENGTH);

    const cipher = createCipheriv(
        ALGORITHM,
        key,
        nonce,
    );

    cipher.setAAD(Buffer.from(aad, "utf8"));

    const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return { ciphertext, nonce, tag };
}

function decrypt(
    ciphertext: Buffer,
    key: Buffer,
    nonce: Buffer,
    tag: Buffer,
    aad: string,
): Buffer {
    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        nonce,
    );

    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);

    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
}

export function encryptVaultContent(
    vaultId: string,
    content: string,
) {
    const dek = randomBytes(KEY_LENGTH);

    try {
        const encryptedContent = encrypt(
            Buffer.from(content, "utf8"),
            dek,
            `vaultshare:v1:content:${vaultId}`,
        );

        const encryptedDek = encrypt(
            dek,
            KEK,
            `vaultshare:v1:dek:${vaultId}`,
        );

        return {
            encryptedContent:
                encryptedContent.ciphertext.toString("base64"),

            encryptionNonce:
                encryptedContent.nonce.toString("base64"),

            encryptionTag:
                encryptedContent.tag.toString("base64"),

            encryptedDek: Buffer.concat([
                encryptedDek.nonce,
                encryptedDek.ciphertext,
                encryptedDek.tag,
            ]).toString("base64"),
        };
    } finally {
        dek.fill(0);
    }
}

export function decryptVaultContent(
    vaultId: string,
    data: {
        encryptedContent: string;
        encryptionNonce: string;
        encryptionTag: string;
        encryptedDek: string;
    },
): string {
    const wrappedDek = Buffer.from(
        data.encryptedDek,
        "base64",
    );

    if (wrappedDek.length !== NONCE_LENGTH + KEY_LENGTH + TAG_LENGTH) {
        throw new Error("Invalid encrypted DEK format");
    }

    const nonce = wrappedDek.subarray(0, NONCE_LENGTH);
    const ciphertext = wrappedDek.subarray(
        NONCE_LENGTH,
        NONCE_LENGTH + KEY_LENGTH,
    );
    const tag = wrappedDek.subarray(NONCE_LENGTH + KEY_LENGTH);

    const dek = decrypt(
        ciphertext,
        KEK,
        nonce,
        tag,
        `vaultshare:v1:dek:${vaultId}`,
    );

    try {
        const plaintext = decrypt(
            Buffer.from(data.encryptedContent, "base64"),
            dek,
            Buffer.from(data.encryptionNonce, "base64"),
            Buffer.from(data.encryptionTag, "base64"),
            `vaultshare:v1:content:${vaultId}`,
        );

        return plaintext.toString("utf8");
    } finally {
        dek.fill(0);
    }
}