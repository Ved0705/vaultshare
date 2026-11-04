
import { db } from "../../db/client.js";
import { shares } from "../../db/schema/shares.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";

export async function createShare(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    data: typeof shares.$inferInsert,
) {
    const [share] = await tx
        .insert(shares)
        .values(data)
        .returning();

    if (!share) {
        throw new Error("Share creation failed");
    }

    return share;
}

export async function createShareCredential(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    data: typeof shareCredentials.$inferInsert,
) {
    const [credential] = await tx
        .insert(shareCredentials)
        .values(data)
        .returning();

    if (!credential) {
        throw new Error("Share credential creation failed");
    }

    return credential;
}
