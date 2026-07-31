import express from 'express';
import { sendError, sendSuccess } from '../../../utils/sendResponse';
import adminAnalyticsService from './service';

class adminAnalyticsController {
    private service = new adminAnalyticsService();

    overview = async (_req: express.Request, res: express.Response) => {
        try {
            const result = await this.service.overview();
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
