import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { parsePagination } from '../../../utils/pagination';
import adminUsersService from './service';

class adminUsersController {
    private service: adminUsersService;
    constructor() {
        this.service = new adminUsersService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>);
            const q = typeof req.query.q === 'string' ? req.query.q : null;
            let is_active: boolean | null = null;
            let is_verified: boolean | null = null;
            if (req.query.is_active === 'true') is_active = true;
            else if (req.query.is_active === 'false') is_active = false;
            if (req.query.is_verified === 'true') is_verified = true;
            else if (req.query.is_verified === 'false') is_verified = false;

            const result = await this.service.list({ page, pageSize, skip, q, is_active, is_verified });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin users list', error);
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
                const status = result.code === 'USER_NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin users getById', error);
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
            console.error('Error in admin users create', error);
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
                if (result.code === 'USER_NOT_FOUND') status = 404;
                else if (result.code === 'DUPLICATE_PHONE') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin users update', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminUsersController;
