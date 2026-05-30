import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminServicesService from './service';

class adminServicesController {
    private service: adminServicesService;
    constructor() {
        this.service = new adminServicesService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const includeDeleted =
                req.query.include_deleted === 'true' || req.query.include_deleted === '1';
            const result = await this.service.list({ includeDeleted });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin services controller] list', e);
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
            console.error('[admin services controller] getById', e);
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
                if (result.code === 'DUPLICATE_SLUG') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 201, result.message, result.data);
        } catch (e) {
            console.error('[admin services controller] create', e);
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
                else if (result.code === 'DUPLICATE_SLUG') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin services controller] update', e);
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
            return sendSuccess(res, 200, result.message);
        } catch (e) {
            console.error('[admin services controller] delete', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    upload = async (req: express.Request, res: express.Response) => {
        try {
            if (!req.uploadedFile) {
                return sendError(res, 400, 'No file uploaded', 'VALIDATION');
            }
            return sendSuccess(res, 200, 'File uploaded.', {
                url: req.uploadedFile.url,
                key: req.uploadedFile.key,
                content_type: req.uploadedFile.contentType,
                size: req.uploadedFile.size,
                original_name: req.uploadedFile.originalName,
            });
        } catch (e) {
            console.error('[admin services controller] upload', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminServicesController;
