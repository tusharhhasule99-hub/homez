import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { parsePagination } from '../../../utils/pagination';
import adminAuditService from './service';

class adminAuditController {
    private service = new adminAuditService();

    list = async (req: express.Request, res: express.Response) => {
        try {
            const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>);
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : null;
            const result = await this.service.list({ page, pageSize, skip, q, entityType });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin audit controller] list', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminAuditController;
