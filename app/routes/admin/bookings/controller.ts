import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { BookingStatus } from '../../../generated/prisma/enums';
import adminBookingsService from './service';

function parseStatus(raw: unknown): BookingStatus | null {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const normalized = raw.trim().toUpperCase().replace(/ /g, '_');
    const all = Object.values(BookingStatus) as string[];
    return all.includes(normalized) ? (normalized as BookingStatus) : null;
}

class adminBookingsController {
    private service: adminBookingsService;
    constructor() {
        this.service = new adminBookingsService();
    }

    list = async (req: express.Request, res: express.Response) => {
        try {
            const status = parseStatus(req.query.status);
            const userIdRaw = req.query.user_id;
            const userId =
                typeof userIdRaw === 'string' && userIdRaw.trim()
                    ? userIdRaw.trim()
                    : null;
            const result = await this.service.list({ status, userId });
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin bookings controller] list', e);
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
            console.error('[admin bookings controller] getById', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    updateStatus = async (req: express.Request, res: express.Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
            if (!id) return sendError(res, 400, 'id is required', 'VALIDATION');

            const body = req.body ?? {};
            const result = await this.service.updateStatus(id, body.status, body.staff_name);
            if (!result.success) {
                let status = 400;
                if (result.code === 'NOT_FOUND') status = 404;
                else if (result.code === 'INVALID') status = 409;
                else if (result.code === 'INTERNAL_SERVER_ERROR') status = 500;
                return sendError(res, status, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (e) {
            console.error('[admin bookings controller] updateStatus', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminBookingsController;
