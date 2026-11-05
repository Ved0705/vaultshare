
import multer from "multer";
import { AppError } from "../../shared/app-error.js";

export const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
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
