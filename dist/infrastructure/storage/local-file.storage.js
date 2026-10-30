import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { env } from "../../config/env.js";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class LocalFileStorage {
    rootDirectory = resolve(env.STORAGE_PATH);
    getFilePath(storageKey) {
        if (!UUID_PATTERN.test(storageKey)) {
            throw new Error("Invalid storage key");
        }
        return join(this.rootDirectory, `${storageKey}.blob`);
    }
    async put(storageKey, content) {
        const filePath = this.getFilePath(storageKey);
        await mkdir(this.rootDirectory, {
            recursive: true,
            mode: 0o700,
        });
        try {
            await pipeline(content, createWriteStream(filePath, {
                flags: "wx",
                mode: 0o600,
            }));
        }
        catch (error) {
            await unlink(filePath).catch(() => undefined);
            throw error;
        }
    }
    get(storageKey) {
        return createReadStream(this.getFilePath(storageKey));
    }
    async delete(storageKey) {
        const filePath = this.getFilePath(storageKey);
        try {
            await unlink(filePath);
        }
        catch (error) {
            if (typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "ENOENT") {
                return;
            }
            throw error;
        }
    }
}
//# sourceMappingURL=local-file.storage.js.map