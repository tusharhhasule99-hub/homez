import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import authService from './service';

class authController {
    private authService: authService;
    constructor() {
        this.authService = new authService();
    }

    login = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number } = req.body;
            if (!phone_number) {
                return sendError(res, 400, 'Phone number is required');
            }

            const result = await this.authService.login(phone_number);
            if (!result.success) {
                const status = result.code === 'SERVER_CONFIG' ? 503 : 400;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in login :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    resendOtp = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number } = req.body;
            if (!phone_number) {
                return sendError(res, 400, 'Phone number is required');
            }

            const result = await this.authService.resendOtp(phone_number);
            if (!result.success) {
                const status = result.code === 'SERVER_CONFIG' ? 503 : 400;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in resendOtp :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    verify = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number, otp } = req.body;
            if (!phone_number || !otp) {
                return sendError(res, 400, 'Phone number and OTP are required');
            }

            const result = await this.authService.verify(phone_number, String(otp));
            if (!result.success) {
                const status = result.code === 'SERVER_CONFIG' ? 503 : 400;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in verify :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    onboarding = async (req: express.Request, res: express.Response) => {
        try {
            const userId = req.auth?.sub;
            if (!userId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }

            const body = req.body;
            if (!body || typeof body !== 'object') {
                return sendError(res, 400, 'JSON body required', 'VALIDATION');
            }

            const result = await this.authService.submitOnboardingStep(userId, body as Record<string, unknown>);
            if (!result.success) {
                const code = result.code;
                let status = 400;
                if (code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (code === 'USER_NOT_FOUND') status = 404;
                else if (code === 'NOT_VERIFIED') status = 403;
                else if (code === 'ONBOARDING_COMPLETE' || code === 'INVALID_STEP_ORDER') status = 409;
                return sendError(res, status, result.message, code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in onboarding :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    getUser = async (req: express.Request, res: express.Response) => {
        try {
            const userId = req.auth?.sub;
            if (!userId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }

            const result = await this.authService.getUser(userId);
            if (!result.success) {
                let status = 400;
                if (result.code === 'USER_NOT_FOUND') status = 404;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in getUser :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default authController;
