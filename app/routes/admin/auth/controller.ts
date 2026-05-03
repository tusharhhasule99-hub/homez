import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminAuthService from './service';

class adminAuthController {
    private service: adminAuthService;
    constructor() {
        this.service = new adminAuthService();
    }

    login = async (req: express.Request, res: express.Response) => {
        try {
            const { email, password } = req.body ?? {};
            if (typeof email !== 'string' || typeof password !== 'string') {
                return sendError(res, 400, 'email and password are required', 'VALIDATION');
            }

            const result = await this.service.login(email, password);
            if (!result.success) {
                let status = 400;
                if (result.code === 'INVALID_CREDENTIALS') status = 401;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (result.code === 'SERVER_CONFIG') status = 503;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin login', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    me = async (req: express.Request, res: express.Response) => {
        try {
            const adminId = req.adminAuth?.sub;
            if (!adminId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }

            const result = await this.service.getMe(adminId);
            if (!result.success) {
                const status = result.code === 'ADMIN_NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin me', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminAuthController;
