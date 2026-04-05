import jwt from 'jsonwebtoken';

export type AccessTokenPayload = {
    sub: string;
    phone_number: string;
};

export class MissingJwtSecretError extends Error {
    readonly code = 'MISSING_JWT_SECRET';
    constructor() {
        super('JWT_SECRET is not set (add to .env)');
        this.name = 'MissingJwtSecretError';
    }
}

export function signAccessToken(payload: AccessTokenPayload): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new MissingJwtSecretError();
    }
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
    return jwt.sign(
        { sub: payload.sub, phone_number: payload.phone_number },
        secret,
        { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
    );
}
