import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    COGNITO_USERINFO_URL: z.string().url(),

    DATABASE_URL: z.string().url(),

    STORAGE_PATH: z.string().min(1),

    MAIL_HOST: z.string().min(1),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535),
    MAIL_FROM: z.string().email().or(z.string().min(1)),

    COGNITO_REGION: z.string().min(1),
    COGNITO_USER_POOL_ID: z.string().min(1),
    COGNITO_CLIENT_ID: z.string().min(1),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(z.treeifyError(result.error));
    process.exit(1);
}

export const env = result.data;