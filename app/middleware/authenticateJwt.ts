import type express from 'express';
import { verifyAccessToken, MissingJwtSecretError } from '../utils/authToken';
import { sendError } from '../utils/sendResponse';

export function authenticateJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return sendError(res, 401, 'Authorization Bearer token required', 'UNAUTHORIZED');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
        return sendError(res, 401, 'Authorization Bearer token required', 'UNAUTHORIZED');
    }
    try {
        req.auth = verifyAccessToken(token);
        next();
    } catch (e) {
        if (e instanceof MissingJwtSecretError) {
            return sendError(res, 503, 'Server configuration error.', 'SERVER_CONFIG');
        }
        return sendError(res, 401, 'Invalid or expired token', 'INVALID_TOKEN');
    }
}
