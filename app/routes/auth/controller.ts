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
                return sendError(res, 400, result.message, result.code);
            }

            return sendSuccess(res, 201, result.message, result.data);
        } catch (error) {
            console.error("Error in register :: Internal server error", error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    }
}

export default authController;