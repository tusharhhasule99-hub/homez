import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminAnalyticsService, { type AnalyticsRange } from './service';

function parseRange(raw: unknown): AnalyticsRange {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === 'today' || s === '7d' || s === '30d') return s;
    return '30d';
}

class adminAnalyticsController {
    private service = new adminAnalyticsService();

    overview = async (req: express.Request, res: express.Response) => {
        try {
            const range = parseRange(req.query.range);
            const result = await this.service.overview(range);
            if (!result.success) {
                return sendError(res, 500, result.message, result.code);
            }
            return sendSuccess(res, 200, result.message, result.data);
        } catch (error) {
            console.error('Error in admin analytics overview', error);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminAnalyticsController;
