import type { AccessTokenPayload } from '../utils/authToken';

declare global {
    namespace Express {
        interface Request {
            auth?: AccessTokenPayload;
        }
    }
}

export {};
