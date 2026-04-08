import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import staffService from './service';

class staffController {
    private staffService: staffService;
    constructor() {
        this.staffService = new staffService();
    }

    login = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number } = req.body;
            if (!phone_number) {
                return sendError(res, 400, 'Phone number is required');
            }

            const result = await this.staffService.login(phone_number);
            if (!result.success) {
                let status = 400;
                if (result.code === 'STAFF_NOT_FOUND') status = 404;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (result.code === 'SERVER_CONFIG') status = 503;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in staff login :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    register = async (req: express.Request, res: express.Response) => {
        try {
            const body = req.body;
            if (!body || typeof body !== 'object') {
                return sendError(res, 400, 'JSON body required', 'VALIDATION');
            }

            const result = await this.staffService.register(body as Record<string, unknown>);
            if (!result.success) {
                let status = 400;
                if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (result.code === 'SERVER_CONFIG') status = 503;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in staff register :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    resendOtp = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number } = req.body;
            if (!phone_number) {
                return sendError(res, 400, 'Phone number is required');
            }

            const result = await this.staffService.resendOtp(phone_number);
            if (!result.success) {
                let status = 400;
                if (result.code === 'STAFF_NOT_FOUND') status = 404;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (result.code === 'SERVER_CONFIG') status = 503;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message);
        } catch (error) {
            console.error('Error in staff resendOtp :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    verifyOtp = async (req: express.Request, res: express.Response) => {
        try {
            const { phone_number, otp } = req.body;
            if (!phone_number || !otp) {
                return sendError(res, 400, 'Phone number and OTP are required');
            }

            const result = await this.staffService.verifyOtp(phone_number, String(otp));
            if (!result.success) {
                let status = 400;
                if (result.code === 'STAFF_NOT_FOUND') status = 404;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                else if (result.code === 'SERVER_CONFIG') status = 503;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in staff verifyOtp :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    upload = async (req: express.Request, res: express.Response) => {
        try {
            const staffId = req.staffAuth?.sub;
            if (!staffId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }

            const useCaseRaw = typeof req.query.use_case === 'string' ? req.query.use_case.trim().toLowerCase() : '';
            if (useCaseRaw !== 'profile' && useCaseRaw !== 'media') {
                return sendError(res, 400, 'use_case must be profile or media', 'VALIDATION');
            }

            if (!req.uploadedFile) {
                return sendError(res, 400, 'No file uploaded', 'VALIDATION');
            }

            const result = await this.staffService.uploadAsset(staffId, useCaseRaw, req.uploadedFile);
            if (!result.success) {
                let status = 400;
                if (result.code === 'STAFF_NOT_FOUND') status = 404;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in staff upload :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default staffController;
