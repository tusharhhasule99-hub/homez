import { prisma } from '../../utils/prisma';
import { normalizePhoneForStorage } from '../../utils/phone';

class authService {
    constructor() {
    }

    register = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return {
                    success: false,
                    message: 'Phone number is required',
                };
            }

            const existingUser = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: true,
                },
            });
            if (existingUser) {
                return {
                    success: false,
                    message: 'User already exists. Please login to continue.',
                };
            }

            const newUser = await prisma.users.create({
                data: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: true,
                },
            });

            return {
                success: true,
                message: 'User registered successfully. Please login to continue.',
                data: newUser,
            };
        } catch (error) {
            console.error("Error in register service :: Internal server error", error);
            return {
                success: false,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR',
            };
        }
    };

    login = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return {
                    success: false,
                    message: 'Phone number is required',
                };
            }

            const user = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: true,
                },
            });
            if (!user) {
                return {
                    success: false,
                    message: 'User not found. Please register to continue.',
                };
            }

            return {
                success: true,
                message: 'Login successful.',
                data: user,
            };
        } catch (error) {
            console.error('Error in login service :: Internal server error', error);
            return {
                success: false,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR',
            };
        }
    };
}

export default authService;