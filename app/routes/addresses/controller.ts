import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import addressService from './service';

function userId(req: express.Request): string | undefined {
    return req.auth?.sub;
}

class addressController {
    private addressService: addressService;
    constructor() {
        this.addressService = new addressService();
    }

    list = async (req: express.Request, res: express.Response) => {
        const uid = userId(req);
        if (!uid) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const result = await this.addressService.list(uid);
        if (!result.success) {
            return sendError(res, 500, result.message, 'ADDRESS_LIST_FAILED');
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    getById = async (req: express.Request, res: express.Response) => {
        const uid = userId(req);
        if (!uid) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const raw = req.params.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        if (!id?.trim()) return sendError(res, 400, 'Address id is required.', 'VALIDATION');
        const result = await this.addressService.getById(uid, id.trim());
        if (!result.success) {
            const status = result.code === 'NOT_FOUND' ? 404 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    create = async (req: express.Request, res: express.Response) => {
        const uid = userId(req);
        if (!uid) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.addressService.create(uid, body as Record<string, unknown>);
        if (!result.success) {
            let status = 400;
            if (result.code === 'ADDRESS_LIMIT') status = 409;
            else if (result.code === 'SERVER') status = 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 201, 'Address saved.', result.data);
    };

    update = async (req: express.Request, res: express.Response) => {
        const uid = userId(req);
        if (!uid) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const raw = req.params.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        if (!id?.trim()) return sendError(res, 400, 'Address id is required.', 'VALIDATION');
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.addressService.update(uid, id.trim(), body as Record<string, unknown>);
        if (!result.success) {
            const status =
                result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION' ? 400 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'Address updated.', result.data);
    };

    delete = async (req: express.Request, res: express.Response) => {
        const uid = userId(req);
        if (!uid) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const raw = req.params.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        if (!id?.trim()) return sendError(res, 400, 'Address id is required.', 'VALIDATION');
        const result = await this.addressService.delete(uid, id.trim());
        if (!result.success) {
            const status = result.code === 'NOT_FOUND' ? 404 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'Address removed.', result.data);
    };
}

export default addressController;
