import type { Readable } from "node:stream";
import type { FileStorage } from "./storage.interface.js";
export declare class LocalFileStorage implements FileStorage {
    private readonly rootDirectory;
    private getFilePath;
    put(storageKey: string, content: Readable): Promise<void>;
    get(storageKey: string): Readable;
    delete(storageKey: string): Promise<void>;
}
