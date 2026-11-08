
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";

const STORAGE_DIRECTORY = path.resolve(env.STORAGE_PATH, "files");

export async function storeEncryptedFile(
    encryptedContent: Buffer,
): Promise<string> {
    await mkdir(STORAGE_DIRECTORY, { recursive: true, mode: 0o700 });

    const storageKey = randomBytes(32).toString("hex");
    const filePath = path.join(STORAGE_DIRECTORY, storageKey);

    await writeFile(filePath, encryptedContent, { flag: "wx", mode: 0o600 });

    return storageKey;
}

export async function readEncryptedFile(
    storageKey: string,
): Promise<Buffer> {
    if (!/^[a-f0-9]{64}$/.test(storageKey)) {
        throw new Error("Invalid storage key");
    }

    return readFile(path.join(STORAGE_DIRECTORY, storageKey));
}

export async function deleteStoredFile(
    storageKey: string,
): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(storageKey)) {
        throw new Error("Invalid storage key");
    }

    await unlink(path.join(STORAGE_DIRECTORY, storageKey));
}
