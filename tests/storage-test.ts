
import { Readable } from "node:stream";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFileStorage } from "../src/infrastructure/storage/local-file.storage.js";

const directory = await mkdtemp(join(tmpdir(), "vaultshare-test-"));



try {
    const storage = new LocalFileStorage(directory);
    const key = "123e4567-e89b-42d3-a456-426614174000";
    const content = "VaultShare private storage test";

    await storage.put(key, Readable.from([content]));

    const filePath = join(directory, `${key}.blob`);
    const stored = await readFile(filePath, "utf8");

    assert.equal(stored, content);

    const fileStats = await stat(filePath);
    assert.ok(fileStats.isFile());

    const chunks: Buffer[] = [];

    for await (const chunk of storage.get(key)) {
        chunks.push(Buffer.from(chunk));
    }

    assert.equal(Buffer.concat(chunks).toString(), content);

    await storage.delete(key);

    await assert.rejects(stat(filePath));

    console.log("Private storage tests passed!");
} finally {
    await rm(directory, { recursive: true, force: true });
}
