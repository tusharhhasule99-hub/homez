import type express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import { JobOfferStatus } from '../../../generated/prisma/enums';
import { prisma } from '../../../utils/prisma';
import { addClient, removeClient, type SseClient } from '../../../realtime/sseRegistry';
import { acceptOffer, declineOffer, listOffers } from './dispatchService';

const HEARTBEAT_MS = () => Number(process.env.SSE_HEARTBEAT_MS ?? 15000);

function paramId(req: express.Request, key: string): string {
    const raw = req.params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v ?? '').trim();
}

class staffJobsController {
    /**
     * Long-lived SSE stream. The staff app holds this open to receive
     * `job.offered` / `job.assigned` / `job.expired` events in real time.
     */
    stream = async (req: express.Request, res: express.Response) => {
        const staffId = req.staffAuth?.sub;
        if (!staffId) {
            return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        res.write(': connected\n\n');

        // Replay outstanding offers so a reconnecting app doesn't miss live jobs.
        try {
            const pending = await prisma.jobOffer.findMany({
                where: { staff_id: staffId, status: JobOfferStatus.PENDING, expires_at: { gt: new Date() } },
                select: {
                    id: true,
                    expires_at: true,
                    booking: {
                        select: {
                            id: true,
                            total_amount: true,
                            service: { select: { title: true } },
                            address: { select: { area: true, city: true } },
                        },
                    },
                },
            });
            for (const offer of pending) {
                res.write(
                    `event: job.offered\ndata: ${JSON.stringify({
                        offerId: offer.id,
                        bookingId: offer.booking.id,
                        service: offer.booking.service.title,
                        area: offer.booking.address.area,
                        city: offer.booking.address.city,
                        amount: Number(offer.booking.total_amount),
                        expiresAt: offer.expires_at.toISOString(),
                    })}\n\n`,
                );
            }
        } catch (e) {
            console.error('[sse] replay failed', e);
        }

        const heartbeat = setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch {
                /* eviction happens on close */
            }
        }, HEARTBEAT_MS());

        const client: SseClient = { res, heartbeat };
        addClient(staffId, client);

        req.on('close', () => {
            removeClient(staffId, client);
        });
    };

    listOffers = async (req: express.Request, res: express.Response) => {
        try {
            const staffId = req.staffAuth?.sub;
            if (!staffId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }
            const offers = await listOffers(staffId);
            return sendSuccess(res, 200, 'Offers fetched successfully.', offers);
        } catch (error) {
            console.error('Error in staff listOffers :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    accept = async (req: express.Request, res: express.Response) => {
        try {
            const staffId = req.staffAuth?.sub;
            if (!staffId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }
            const offerId = paramId(req, 'offerId');
            if (!offerId) {
                return sendError(res, 400, 'offerId is required', 'VALIDATION');
            }

            const result = await acceptOffer(staffId, offerId);
            if (!result.success) {
                let status = 400;
                if (result.code === 'NOT_FOUND') status = 404;
                else if (result.code === 'EXPIRED') status = 410;
                else if (result.code === 'ALREADY_TAKEN') status = 409;
                else if (result.code === 'SERVER') status = 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, 'Job accepted successfully.', result.data);
        } catch (error) {
            console.error('Error in staff accept :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    decline = async (req: express.Request, res: express.Response) => {
        try {
            const staffId = req.staffAuth?.sub;
            if (!staffId) {
                return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');
            }
            const offerId = paramId(req, 'offerId');
            if (!offerId) {
                return sendError(res, 400, 'offerId is required', 'VALIDATION');
            }

            const result = await declineOffer(staffId, offerId);
            if (!result.success) {
                const status = result.code === 'NOT_FOUND' ? 404 : 500;
                return sendError(res, status, result.message, result.code);
            }

            return sendSuccess(res, 200, 'Job declined.');
        } catch (error) {
            console.error('Error in staff decline :: Internal server error', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default staffJobsController;
