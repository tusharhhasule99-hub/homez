import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import bookingService from './service';

function uid(req: express.Request): string | undefined {
    return req.auth?.sub;
}

function paramId(req: express.Request, key: string): string {
    const raw = req.params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v ?? '').trim();
}

class bookingController {
    private bookingService: bookingService;
    constructor() {
        this.bookingService = new bookingService();
    }

    list = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const result = await this.bookingService.list(userId);
        if (!result.success) {
            return sendError(res, 500, result.message, 'BOOKING_LIST_FAILED');
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    getById = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const id = paramId(req, 'id');
        if (!id) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');
        const result = await this.bookingService.getById(userId, id);
        if (!result.success) {
            const status = result.code === 'NOT_FOUND' ? 404 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    create = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        if (!req.body || typeof req.body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.bookingService.create(userId, req.body as Record<string, unknown>);
        if (!result.success) {
            const status =
                result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION' ? 400 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 201, 'Booking created.', result.data);
    };

    applyCoupon = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const id = paramId(req, 'id');
        if (!id) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');
        if (!req.body || typeof req.body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.bookingService.applyCoupon(userId, id, req.body as Record<string, unknown>);
        if (!result.success) {
            let status = 400;
            if (result.code === 'NOT_FOUND') status = 404;
            else if (result.code === 'CONFLICT') status = 409;
            else if (result.code === 'INVALID') status = 422;
            else if (result.code === 'SERVER') status = 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'Coupon applied.', result.data);
    };

    updateStatus = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const id = paramId(req, 'id');
        if (!id) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');
        if (!req.body || typeof req.body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.bookingService.updateStatus(userId, id, req.body as Record<string, unknown>);
        if (!result.success) {
            const status =
                result.code === 'NOT_FOUND'
                    ? 404
                    : result.code === 'VALIDATION'
                      ? 400
                      : result.code === 'INVALID'
                        ? 409
                        : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'Status updated.', result.data);
    };

    rate = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        const id = paramId(req, 'id');
        if (!id) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');
        if (!req.body || typeof req.body !== 'object') {
            return sendError(res, 400, 'JSON body required', 'VALIDATION');
        }
        const result = await this.bookingService.submitRating(userId, id, req.body as Record<string, unknown>);
        if (!result.success) {
            let status = 400;
            if (result.code === 'NOT_FOUND') status = 404;
            else if (result.code === 'CONFLICT') status = 409;
            else if (result.code === 'INVALID') status = 422;
            else if (result.code === 'SERVER') status = 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'Thank you for your rating.', result.data);
    };
}

export default bookingController;
