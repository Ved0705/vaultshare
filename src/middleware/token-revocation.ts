import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { revokedAccessTokens } from "../db/schema/revoked-access-tokens.js";

export async function isAccessTokenRevoked(jti: string): Promise<boolean> {
    const [revoked] = await db
        .select({ jti: revokedAccessTokens.jti })
        .from(revokedAccessTokens)
        .where(eq(revokedAccessTokens.jti, jti))
        .limit(1);
    return Boolean(revoked);
}
