import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { parsePagination } from '../../../utils/pagination';
import adminDiscountsService from './service';

class adminDiscountsController {
    private service = new adminDiscountsService();

    list = async (req: express.Request, res: express.Response) => {
        try {
            const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>);
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            const includeDeleted =
                req.query.include_deleted === 'true' || req.query.include_deleted === '1';
            let is_active: boolean | null = null;
            if (req.query.is_active === 'true') is_active = true;
            else if (req.query.is_active === 'false') is_active = false;

            const result = await this.service.list({
                page,
                pageSize,
                skip,
                q,
                includeDeleted,
                is_active,
            });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin discounts controller] list', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    getById = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) return sendError(res, 400, 'id is required', 'VALIDATION');
            const result = await this.service.getById(id);
            if (!result.success) {
                const status = result.code === 'NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin discounts controller] getById', e);
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
                if (result.code === 'DUPLICATE_CODE') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 201, result.message, result.data);
        } catch (e) {
            console.error('[admin discounts controller] create', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    update = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) return sendError(res, 400, 'id is required', 'VALIDATION');
            const body = req.body;
            if (!body || typeof body !== 'object') {
                return sendError(res, 400, 'JSON body required', 'VALIDATION');
            }
            const result = await this.service.update(id, body as Record<string, unknown>);
            if (!result.success) {
                let status = 400;
                if (result.code === 'NOT_FOUND') status = 404;
                else if (result.code === 'DUPLICATE_CODE') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin discounts controller] update', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    delete = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) return sendError(res, 400, 'id is required', 'VALIDATION');
            const result = await this.service.softDelete(id);
            if (!result.success) {
                const status = result.code === 'NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin discounts controller] delete', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminDiscountsController;
