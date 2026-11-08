import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

const KEK_BY_VERSION = new Map<number, Buffer>([
    [1, Buffer.from(env.VAULT_KEK_BASE64, "base64")],
    ...(env.VAULT_KEK_V2_BASE64 ? [[2, Buffer.from(env.VAULT_KEK_V2_BASE64, "base64")] as [number, Buffer]] : []),
]);
const CURRENT_KEK_VERSION = env.VAULT_KEK_CURRENT_VERSION;

function getKek(version: number): Buffer {
    const key = KEK_BY_VERSION.get(version);
    if (!key || key.length !== KEY_LENGTH) {
        throw new Error("Required KEK version is not configured");
    }
    return key;
}

function encrypt(plaintext: Buffer, key: Buffer, aad: string) {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decrypt(ciphertext: Buffer, key: Buffer, nonce: Buffer, tag: Buffer, aad: string): Buffer {
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function unpackWrappedDek(value: string, label: string) {
    const wrapped = Buffer.from(value, "base64");
    if (wrapped.length !== NONCE_LENGTH + KEY_LENGTH + TAG_LENGTH) {
        throw new Error(`Invalid ${label} DEK format`);
    }
    return {
        nonce: wrapped.subarray(0, NONCE_LENGTH),
        ciphertext: wrapped.subarray(NONCE_LENGTH, NONCE_LENGTH + KEY_LENGTH),
        tag: wrapped.subarray(NONCE_LENGTH + KEY_LENGTH),
    };
}

function wrapDek(id: string, dek: Buffer, version: number): string {
    const wrapped = encrypt(dek, getKek(version), `vaultshare:v1:dek:${id}`);
    return Buffer.concat([wrapped.nonce, wrapped.ciphertext, wrapped.tag]).toString("base64");
}

function unwrapDek(id: string, encryptedDek: string, version: number): Buffer {
    const wrapped = unpackWrappedDek(encryptedDek, "wrapped");
    return decrypt(wrapped.ciphertext, getKek(version), wrapped.nonce, wrapped.tag, `vaultshare:v1:dek:${id}`);
}

/** Rewraps only the DEK envelope; encrypted content and its AAD remain unchanged. */
export function rewrapKekEncryptedDek(id: string, encryptedDek: string, fromVersion: number, toVersion: number): string {
    if (fromVersion === toVersion) return encryptedDek;
    const dek = unwrapDek(id, encryptedDek, fromVersion);
    try {
        return wrapDek(id, dek, toVersion);
    } finally {
        dek.fill(0);
    }
}

export function encryptVaultContent(vaultId: string, content: string) {
    const dek = randomBytes(KEY_LENGTH);
    try {
        const encryptedContent = encrypt(Buffer.from(content, "utf8"), dek, `vaultshare:v1:content:${vaultId}`);
        return {
            encryptedContent: encryptedContent.ciphertext.toString("base64"),
            encryptionNonce: encryptedContent.nonce.toString("base64"),
            encryptionTag: encryptedContent.tag.toString("base64"),
            encryptedDek: wrapDek(vaultId, dek, CURRENT_KEK_VERSION),
            kekVersion: CURRENT_KEK_VERSION,
        };
    } finally {
        dek.fill(0);
    }
}

export function decryptVaultContent(vaultId: string, data: {
    encryptedContent: string;
    encryptionNonce: string;
    encryptionTag: string;
    encryptedDek: string;
    kekVersion?: number;
}): string {
    const dek = unwrapDek(vaultId, data.encryptedDek, data.kekVersion ?? 1);
    try {
        return decrypt(
            Buffer.from(data.encryptedContent, "base64"),
            dek,
            Buffer.from(data.encryptionNonce, "base64"),
            Buffer.from(data.encryptionTag, "base64"),
            `vaultshare:v1:content:${vaultId}`,
        ).toString("utf8");
    } finally {
        dek.fill(0);
    }
}

interface VaultEncryptionData {
    encryptedDek: string;
    kekVersion?: number;
}
interface FileEncryptionData {
    encryptedContent: Buffer;
    encryptionNonce: string;
    encryptionTag: string;
    encryptedDek: string;
}

export function encryptFileContent(vaultId: string, fileId: string, content: Buffer, vaultData: VaultEncryptionData): FileEncryptionData {
    const vaultDek = unwrapDek(vaultId, vaultData.encryptedDek, vaultData.kekVersion ?? 1);
    const fileDek = randomBytes(KEY_LENGTH);
    try {
        const encryptedContent = encrypt(content, fileDek, `vaultshare:v1:file-content:${vaultId}:${fileId}`);
        const encryptedFileDek = encrypt(fileDek, vaultDek, `vaultshare:v1:file-dek:${vaultId}:${fileId}`);
        return {
            encryptedContent: encryptedContent.ciphertext,
            encryptionNonce: encryptedContent.nonce.toString("base64"),
            encryptionTag: encryptedContent.tag.toString("base64"),
            encryptedDek: Buffer.concat([encryptedFileDek.nonce, encryptedFileDek.ciphertext, encryptedFileDek.tag]).toString("base64"),
        };
    } finally {
        fileDek.fill(0);
        vaultDek.fill(0);
    }
}

export function decryptFileContent(vaultId: string, fileId: string, data: FileEncryptionData, vaultData: VaultEncryptionData): Buffer {
    const vaultDek = unwrapDek(vaultId, vaultData.encryptedDek, vaultData.kekVersion ?? 1);
    const wrappedFileDek = unpackWrappedDek(data.encryptedDek, "file");
    let fileDek: Buffer | undefined;
    try {
        fileDek = decrypt(
            wrappedFileDek.ciphertext, vaultDek, wrappedFileDek.nonce, wrappedFileDek.tag,
            `vaultshare:v1:file-dek:${vaultId}:${fileId}`,
        );
        return decrypt(
            data.encryptedContent, fileDek,
            Buffer.from(data.encryptionNonce, "base64"),
            Buffer.from(data.encryptionTag, "base64"),
            `vaultshare:v1:file-content:${vaultId}:${fileId}`,
        );
    } finally {
        fileDek?.fill(0);
        vaultDek.fill(0);
    }
}