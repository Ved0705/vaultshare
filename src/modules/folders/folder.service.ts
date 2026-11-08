import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { folders } from "../../db/schema/folders.js";
import { vaults } from "../../db/schema/vaults.js";
import { AppError } from "../../shared/app-error.js";

export async function createFolderService(ownerId: string, name: string) {
    const [folder] = await db
        .insert(folders)
        .values({ ownerId, name })
        .returning({
            id: folders.id,
            name: folders.name,
            createdAt: folders.createdAt,
            updatedAt: folders.updatedAt,
        });

    if (!folder) throw new AppError(500, "FOLDER_CREATE_FAILED", "Folder could not be created.");
    return folder;
}

export async function listFoldersService(ownerId: string) {
    return db
        .select({
            id: folders.id,
            name: folders.name,
            createdAt: folders.createdAt,
            updatedAt: folders.updatedAt,
        })
        .from(folders)
        .where(eq(folders.ownerId, ownerId))
        .orderBy(desc(folders.updatedAt), desc(folders.createdAt));
}

export async function updateFolderService(folderId: string, ownerId: string, name: string) {
    const [folder] = await db
        .update(folders)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, ownerId)))
        .returning({
            id: folders.id,
            name: folders.name,
            createdAt: folders.createdAt,
            updatedAt: folders.updatedAt,
        });

    if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found.");
    return folder;
}

export async function deleteFolderService(folderId: string, ownerId: string) {
    return db.transaction(async (tx) => {
        const [folder] = await tx
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.ownerId, ownerId)))
            .for("update")
            .limit(1);

        if (!folder) {
            throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found.");
        }

        // Folder deletion is organizational only: preserve every vault and
        // detach it from the folder rather than deleting its contents.
        const detached = await tx
            .update(vaults)
            .set({ folderId: null, updatedAt: new Date() })
            .where(and(eq(vaults.folderId, folderId), eq(vaults.ownerId, ownerId)))
            .returning({ id: vaults.id });

        await tx.delete(folders).where(
            and(eq(folders.id, folderId), eq(folders.ownerId, ownerId)),
        );

        return { deleted: true, detachedVaultCount: detached.length };
    });
}
