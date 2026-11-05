import argon2 from "argon2";
import { db } from "../../db/client.js";
import { and, count, eq, gte } from "drizzle-orm";

import { passphraseAttempts } from "../../db/schema/passphrase-attempts.js";
import { shareCredentials } from "../../db/schema/share-credentials.js";
import { AppError } from "../../shared/app-error.js";

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;

type DbTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

interface VerifyPassphraseInput {
    tx: DbTransaction;
    shareId: string;
    readerId: string;
    passphrase: string;
}

export async function verifySharePassphrase(
    input: VerifyPassphraseInput,
): Promise<boolean> {
    const windowStart = new Date(
        Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000,
    );

    const [attemptStats] = await input.tx
        .select({ total: count() })
        .from(passphraseAttempts)
        .where(
            and(
                eq(passphraseAttempts.shareId, input.shareId),
                eq(passphraseAttempts.userId, input.readerId),
                eq(passphraseAttempts.succeeded, false),
                gte(passphraseAttempts.attemptedAt, windowStart),
            ),
        );

    if ((attemptStats?.total ?? 0) >= MAX_FAILED_ATTEMPTS) {
        throw new AppError(
            429,
            "TOO_MANY_PASSPHRASE_ATTEMPTS",
            "Too many incorrect passphrase attempts. Try again later.",
        );
    }

    const [credential] = await input.tx
        .select()
        .from(shareCredentials)
        .where(eq(shareCredentials.shareId, input.shareId))
        .limit(1);

    if (!credential) {
        throw new AppError(
            500,
            "SHARE_CREDENTIAL_MISSING",
            "Share credentials are unavailable.",
        );
    }

    const valid = await argon2.verify(
        credential.passphraseHash,
        input.passphrase,
    );

    await input.tx.insert(passphraseAttempts).values({
        shareId: input.shareId,
        userId: input.readerId,
        succeeded: valid,
    });

    return valid;
}