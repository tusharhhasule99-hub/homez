import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { parsePagination } from '../../../utils/pagination';
import { writeAuditLog } from '../../../utils/auditLog';
import adminAdminsService from './service';

class adminAdminsController {
    private service: adminAdminsService;
    constructor() {
        this.service = new adminAdminsService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>);
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            const result = await this.service.list({ page, pageSize, skip, q });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin admins list', error);
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
                if (result.code === 'DUPLICATE_EMAIL') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            await writeAuditLog({
                adminId: req.adminAuth?.sub,
                adminEmail: req.adminAuth?.email,
                action: 'ADMIN_CREATE',
                entityType: 'admin',
                entityId: result.data.id,
                summary: `Created admin ${result.data.email}`,
                meta: { email: result.data.email, name: result.data.name },
            });

            return sendSuccess(res, 201, result.message, result.data);
        } catch (error) {
            console.error('Error in admin admins create', error);
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
                if (result.code === 'NOT_FOUND') status = 404;
                else if (result.code === 'DUPLICATE_EMAIL') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            await writeAuditLog({
                adminId: req.adminAuth?.sub,
                adminEmail: req.adminAuth?.email,
                action: 'ADMIN_UPDATE',
                entityType: 'admin',
                entityId: result.data.id,
                summary: `Updated admin ${result.data.email}`,
                meta: {
                    email: result.data.email,
                    is_active: result.data.is_active,
                    password_changed: 'password' in (body as object),
                },
            });

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin admins update', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminAdminsController;
