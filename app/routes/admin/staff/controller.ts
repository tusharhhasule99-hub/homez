import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminStaffService from './service';

function parseKycIncomplete(req: express.Request): boolean {
    const raw = req.query.kyc_incomplete;
    if (raw === undefined || raw === null) return false;
    const s = Array.isArray(raw) ? raw[0] : raw;
    return s === '1' || s === 'true' || s === 'yes';
}

class adminStaffController {
    private service: adminStaffService;
    constructor() {
        this.service = new adminStaffService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const kycIncomplete = parseKycIncomplete(req);
            const result = await this.service.list({ kycIncomplete });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff list', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    getById = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) {
                return sendError(res, 400, 'id is required', 'VALIDATION');
            }

            const result = await this.service.getById(id);
            if (!result.success) {
                const status = result.code === 'STAFF_NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff getById', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    updateKyc = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) {
                return sendError(res, 400, 'id is required', 'VALIDATION');
            }

            const body = req.body;
            const decision = typeof body?.decision === 'string' ? body.decision.trim().toLowerCase() : '';
            if (decision !== 'approve' && decision !== 'reject') {
                return sendError(res, 400, 'decision must be "approve" or "reject"', 'VALIDATION');
            }

            const result = await this.service.updateKyc(id, decision as 'approve' | 'reject');
            if (!result.success) {
                const status = result.code === 'STAFF_NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff updateKyc', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminStaffController;
