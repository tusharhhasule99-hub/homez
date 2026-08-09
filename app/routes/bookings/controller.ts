import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import bookingService from './service';
import { dispatchBooking } from '../staff/jobs/dispatchService';
import { addUserClient, removeUserClient, type SseClient } from '../../realtime/sseRegistry';
import { BookingStatus } from '../../generated/prisma/enums';
import { prisma } from '../../utils/prisma';

const HEARTBEAT_MS = () => Number(process.env.SSE_HEARTBEAT_MS ?? 15000);

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

    /**
     * Long-lived SSE stream. The user app holds this open to receive
     * `booking.staff_assigned` (and related) events in real time.
     */
    stream = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) {
            return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.write(': connected\n\n');

        // Replay recently assigned bookings so a reconnecting app catches up.
        try {
            const recent = await prisma.booking.findMany({
                where: {
                    user_id: userId,
                    staff_id: { not: null },
                    status: {
                        in: [
                            BookingStatus.ACCEPTED,
                            BookingStatus.ASSIGNING_STAFF,
                            BookingStatus.STAFF_EN_ROUTE,
                            BookingStatus.ARRIVED,
                        ],
                    },
                },
                orderBy: { updated_at: 'desc' },
                take: 20,
                select: {
                    id: true,
                    status: true,
                    staff_id: true,
                    staff_name: true,
                    updated_at: true,
                },
            });
            for (const booking of recent) {
                res.write(
                    `event: booking.staff_assigned\ndata: ${JSON.stringify({
                        bookingId: booking.id,
                        status: booking.status,
                        staffId: booking.staff_id,
                        staffName: booking.staff_name,
                        assignedAt: booking.updated_at.toISOString(),
                        replay: true,
                    })}\n\n`,
                );
            }
        } catch (e) {
            console.error('[sse] user replay failed', e);
        }

        const heartbeat = setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch {
                /* eviction happens on close */
            }
        }, HEARTBEAT_MS());

        const client: SseClient = { res, heartbeat };
        addUserClient(userId, client);

        req.on('close', () => {
            removeUserClient(userId, client);
        });
    };

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
        // Fire-and-forget: start dispatching to nearby staff. Kept out of the
        // create transaction so booking latency is unaffected; the sweep
        // self-heals if this trigger fails.
        void dispatchBooking(result.data.id).catch((e) => console.error('[dispatch] trigger', e));

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
