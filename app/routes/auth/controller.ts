import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import authService from './service';

class authController {
    private authService: authService;
    constructor() {
        this.authService = new authService();
    }

    register = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number } = req.body;
            if (!phone_number) {
                return sendError(res, 400, 'Phone number is required');
            }

            const result = await this.authService.register(phone_number);
            if (!result.success) {
                const status = result.code === 'SERVER_CONFIG' ? 503 : 400;
                return sendError(res, status, result.message, result.code);
            }

            const status = result.created ? 201 : 200;
            return sendSuccess(res, status, result.message, result.data);
        } catch (error) {
            console.error('Error in register :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

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
}

export default authController;
