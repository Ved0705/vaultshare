import "dotenv/config";
export declare const env: {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    DATABASE_URL: string;
    STORAGE_PATH: string;
    MAIL_HOST: string;
    MAIL_PORT: number;
};
