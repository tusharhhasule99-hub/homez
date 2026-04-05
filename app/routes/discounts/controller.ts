import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import discountService from './service';

class discountController {
    private discountService: discountService;
    constructor() {
        this.discountService = new discountService();
    }

    list = async (_req: express.Request, res: express.Response) => {
        const result = await this.discountService.listAvailable();
        if (!result.success) {
            return sendError(res, 500, result.message, 'DISCOUNT_LIST_FAILED');
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    getByCode = async (req: express.Request, res: express.Response) => {
        const raw = req.params.code;
        const code = Array.isArray(raw) ? raw[0] : raw;
        const result = await this.discountService.getByCode(code ?? '');
        if (!result.success) {
            const status =
                result.code === 'NOT_FOUND' ? 404 : result.code === 'SERVER' ? 500 : 400;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };
}

export default discountController;
