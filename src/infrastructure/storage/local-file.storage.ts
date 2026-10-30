
import { mkdir, open, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { env } from "../../config/env.js";
import type { FileStorage } from "./storage.interface.js";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class LocalFileStorage implements FileStorage {
    private readonly rootDirectory: string;

    constructor(rootDirectory: string = env.STORAGE_PATH) {
        this.rootDirectory = resolve(rootDirectory);
    }

    private getFilePath(storageKey: string): string {
        if (!UUID_PATTERN.test(storageKey)) {
            throw new Error("Invalid storage key");
        }

        return join(this.rootDirectory, `${storageKey}.blob`);
    }

    async put(storageKey: string, content: Readable): Promise<void> {
        const filePath = this.getFilePath(storageKey);

        await mkdir(this.rootDirectory, {
            recursive: true,
            mode: 0o700,
        });

        const fileHandle = await open(filePath, "wx", 0o600);

        try {
            await pipeline(content, fileHandle.createWriteStream());
        } catch (error) {
            await unlink(filePath).catch(() => undefined);
            throw error;
        }
    }

    get(storageKey: string): Readable {
        return createReadStream(this.getFilePath(storageKey));
    }

    async delete(storageKey: string): Promise<void> {
        const filePath = this.getFilePath(storageKey);

        try {
            await unlink(filePath);
        } catch (error) {
            if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return;
            }

            throw error;
        }
    }
}
