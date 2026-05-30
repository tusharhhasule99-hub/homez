import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminLocationsService from './service';

class adminLocationsController {
    private service: adminLocationsService;
    constructor() {
        this.service = new adminLocationsService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const userId =
                typeof req.query.user_id === 'string' && req.query.user_id.trim()
                    ? req.query.user_id.trim()
                    : null;
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            const result = await this.service.list({ userId, q });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin locations controller] list', e);
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
            console.error('[admin locations controller] getById', e);
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
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin locations controller] update', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    delete = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) return sendError(res, 400, 'id is required', 'VALIDATION');

            const result = await this.service.delete(id);
            if (!result.success) {
                const status = result.code === 'NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message);
        } catch (e) {
            console.error('[admin locations controller] delete', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminLocationsController;
