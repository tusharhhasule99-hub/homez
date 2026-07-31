import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { parsePagination } from '../../../utils/pagination';
import { writeAuditLog } from '../../../utils/auditLog';
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
            const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>);
            const kycIncomplete = parseKycIncomplete(req);
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            const result = await this.service.list({ kycIncomplete, q, page, pageSize, skip });
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

    create = async (req: express.Request, res: express.Response) => {
        try {
            const body = req.body;
            if (!body || typeof body !== 'object') {
                return sendError(res, 400, 'JSON body required', 'VALIDATION');
            }
            const result = await this.service.create(body as Record<string, unknown>);
            if (!result.success) {
                let status = 400;
                if (result.code === 'DUPLICATE_PHONE') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 201, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff create', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    update = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) {
                return sendError(res, 400, 'id is required', 'VALIDATION');
            }
            const body = req.body;
            if (!body || typeof body !== 'object') {
                return sendError(res, 400, 'JSON body required', 'VALIDATION');
            }
            const result = await this.service.update(id, body as Record<string, unknown>);
            if (!result.success) {
                let status = 400;
                if (result.code === 'STAFF_NOT_FOUND') status = 404;
                else if (result.code === 'DUPLICATE_PHONE') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff update', error);
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

            await writeAuditLog({
                adminId: req.adminAuth?.sub,
                adminEmail: req.adminAuth?.email,
                action: decision === 'approve' ? 'STAFF_KYC_APPROVE' : 'STAFF_KYC_REJECT',
                entityType: 'staff',
                entityId: result.data.id,
                summary: `Staff KYC ${decision}d for ${result.data.name}`,
                meta: { decision, phone: result.data.phone_number },
            });

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin staff updateKyc', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminStaffController;
