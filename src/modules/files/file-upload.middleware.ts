
import multer from "multer";
import { AppError } from "../../shared/app-error.js";
import { env } from "../../config/env.js";

export const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: env.MAX_FILE_SIZE_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        if (!file.originalname || file.originalname.length > 255) {
            callback(new AppError(400, "INVALID_FILENAME", "Invalid filename."));
            return;
        }

        callback(null, true);
    },
});
