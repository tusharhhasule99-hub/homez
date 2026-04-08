import jwt from 'jsonwebtoken';

export type AccessTokenPayload = {
    sub: string;
    phone_number: string;
};

export type StaffAccessTokenPayload = {
    sub: string;
    phone_number: string;
    role: 'staff';
};

export class MissingJwtSecretError extends Error {
    readonly code = 'MISSING_JWT_SECRET';
    constructor() {
        super('JWT_SECRET is not set (add to .env)');
        this.name = 'MissingJwtSecretError';
    }
}

export class MissingStaffJwtSecretError extends Error {
    readonly code = 'MISSING_STAFF_JWT_SECRET';
    constructor() {
        super('STAFF_JWT_SECRET is not set (add to .env)');
        this.name = 'MissingStaffJwtSecretError';
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

export function signStaffAccessToken(payload: Omit<StaffAccessTokenPayload, 'role'>): string {
    const secret = process.env.STAFF_JWT_SECRET;
    if (!secret) {
        throw new MissingStaffJwtSecretError();
    }
    const expiresIn = process.env.STAFF_JWT_EXPIRES_IN ?? '7d';
    return jwt.sign(
        { sub: payload.sub, phone_number: payload.phone_number, role: 'staff' },
        secret,
        { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] },
    );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new MissingJwtSecretError();
    }
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { phone_number?: string };
    if (typeof decoded.sub !== 'string') {
        throw new jwt.JsonWebTokenError('Invalid token subject');
    }
    return {
        sub: decoded.sub,
        phone_number: typeof decoded.phone_number === 'string' ? decoded.phone_number : '',
    };
}

export function verifyStaffAccessToken(token: string): StaffAccessTokenPayload {
    const secret = process.env.STAFF_JWT_SECRET;
    if (!secret) {
        throw new MissingStaffJwtSecretError();
    }
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { phone_number?: string; role?: string };
    if (typeof decoded.sub !== 'string') {
        throw new jwt.JsonWebTokenError('Invalid token subject');
    }
    if (decoded.role !== 'staff') {
        throw new jwt.JsonWebTokenError('Invalid staff token role');
    }
    return {
        sub: decoded.sub,
        phone_number: typeof decoded.phone_number === 'string' ? decoded.phone_number : '',
        role: 'staff',
    };
}
