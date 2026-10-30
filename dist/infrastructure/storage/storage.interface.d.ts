import type { Readable } from "node:stream";
export interface FileStorage {
    put(storageKey: string, content: Readable): Promise<void>;
    get(storageKey: string): Readable;
    delete(storageKey: string): Promise<void>;
}
