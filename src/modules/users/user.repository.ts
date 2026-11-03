
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema/users.js";

export async function findUserByCognitoSub(cognitoSub: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.cognitoSub, cognitoSub))
        .limit(1);

    return user ?? null;
}

export async function createUser(data: {
    cognitoSub: string;
    email: string;
    emailVerified: boolean;
}) {
    const [user] = await db
        .insert(users)
        .values({
            cognitoSub: data.cognitoSub,
            email: data.email,
            emailVerified: data.emailVerified,
        })
        .returning();

    return user;
}

export async function updateUserByCognitoSub(
    cognitoSub: string,
    data: {
        email: string;
        emailVerified: boolean;
    },
) {
    const [user] = await db
        .update(users)
        .set({
            email: data.email,
            emailVerified: data.emailVerified,
            updatedAt: new Date(),
        })
        .where(eq(users.cognitoSub, cognitoSub))
        .returning();

    return user ?? null;
}

