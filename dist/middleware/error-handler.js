import { AppError } from "../shared/app-error.js";
export const errorHandler = (error, req, res, _next) => {
    if (error instanceof AppError) {
        req.log.warn({ code: error.code, statusCode: error.statusCode }, "Request rejected");
        res.status(error.statusCode).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
            },
        });
        return;
    }
    req.log.error({ err: error }, "Unhandled request error");
    res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred",
        },
    });
};
//# sourceMappingURL=error-handler.js.map