import bcrypt from 'bcryptjs';
import { prisma } from '../../../utils/prisma';
import { signAdminAccessToken, MissingAdminJwtSecretError } from '../../../utils/authToken';

const publicAdminSelect = {
    id: true,
    email: true,
    name: true,
    is_active: true,
    created_at: true,
    updated_at: true,
} as const;

export type PublicAdmin = {
    id: string;
    email: string;
    name: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
};

class adminAuthService {
    login = async (emailRaw: string, password: string) => {
        try {
            const email = emailRaw?.trim().toLowerCase();
            if (!email || !password) {
                return { success: false as const, message: 'Email and password are required.', code: 'VALIDATION' as const };
            }

            const admin = await prisma.admin.findUnique({ where: { email } });
            if (!admin || !admin.is_active) {
                return { success: false as const, message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' as const };
            }

            const ok = await bcrypt.compare(password, admin.password_hash);
            if (!ok) {
                return { success: false as const, message: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' as const };
            }

            const slim: PublicAdmin = await prisma.admin.findUniqueOrThrow({
                where: { id: admin.id },
                select: publicAdminSelect,
            });

            const token = signAdminAccessToken({ sub: slim.id, email: slim.email });

            return {
                success: true as const,
                message: 'Signed in successfully.',
                data: { token, admin: slim },
            };
        } catch (error) {
            if (error instanceof MissingAdminJwtSecretError) {
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            console.error('Error in admin login', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getMe = async (adminId: string) => {
        try {
            const admin = await prisma.admin.findFirst({
                where: { id: adminId, is_active: true },
                select: publicAdminSelect,
            });
            if (!admin) {
                return { success: false as const, message: 'Admin not found.', code: 'ADMIN_NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: admin };
        } catch (error) {
            console.error('Error in admin getMe', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminAuthService;
