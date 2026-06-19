import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import paymentService from './service';

function uid(req: express.Request): string | undefined {
    return req.auth?.sub;
}

function paramId(req: express.Request, key: string): string {
    const raw = req.params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v ?? '').trim();
}

class paymentController {
    private paymentService: paymentService;

    constructor() {
        this.paymentService = new paymentService();
    }

    createForBooking = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

        const bookingId = paramId(req, 'bookingId');
        if (!bookingId) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');

        const result = await this.paymentService.createForBooking(userId, bookingId);
        if (!result.success) {
            let status = 500;
            if (result.code === 'NOT_FOUND') status = 404;
            else if (result.code === 'INVALID') status = 400;
            else if (result.code === 'CONFLICT') status = 409;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 201, 'Payment created.', result.data);
    };

    getStatusForBooking = async (req: express.Request, res: express.Response) => {
        const userId = uid(req);
        if (!userId) return sendError(res, 401, 'Unauthorized', 'UNAUTHORIZED');

        const bookingId = paramId(req, 'bookingId');
        if (!bookingId) return sendError(res, 400, 'Booking id is required.', 'VALIDATION');

        const result = await this.paymentService.getStatusForBooking(userId, bookingId);
        if (!result.success) {
            const status = result.code === 'NOT_FOUND' ? 404 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    handlePaymentCallback = async (req: express.Request, res: express.Response): Promise<void> => {
        try {
            const {
                razorpay_payment_id,
                razorpay_payment_link_id,
                razorpay_payment_link_status,
                razorpay_order_id,
                razorpay_signature,
            } = req.query;

            console.log('🔵 PAYMENT CALLBACK RECEIVED - FULL DETAILS:');
            console.log('🔵 Query Parameters:', req.query);
            console.log('🔵 URL:', req.url);
            console.log('🔵 Method:', req.method);
            console.log('🔵 Headers:', req.headers);
            console.log('🔵 Body:', req.body);
            console.log('🔵 Payment Details:', {
                payment_id: razorpay_payment_id,
                payment_link_id: razorpay_payment_link_id,
                payment_link_status: razorpay_payment_link_status,
                order_id: razorpay_order_id,
                signature: razorpay_signature ? 'present' : 'missing',
            });

            let redirectUrl: string;

            if (razorpay_payment_link_status === 'paid') {
                console.log('🟢 Payment successful, redirecting to success');
                redirectUrl = `homzy://payment/success?payment_id=${razorpay_payment_id || ''}&payment_link_id=${razorpay_payment_link_id || ''}`;
            } else if (razorpay_payment_link_status === 'cancelled') {
                console.log('🟡 Payment cancelled by user, redirecting to cancelled');
                redirectUrl = `homzy://payment/cancelled?payment_id=${razorpay_payment_id || ''}&payment_link_id=${razorpay_payment_link_id || ''}`;
            } else if (razorpay_payment_link_status === 'expired') {
                console.log('🟠 Payment link expired, redirecting to expired');
                redirectUrl = `homzy://payment/expired?payment_link_id=${razorpay_payment_link_id || ''}`;
            } else {
                console.log('🔴 Payment failed or unknown status, redirecting to failed');
                redirectUrl = `homzy://payment/failed?payment_id=${razorpay_payment_id || ''}&payment_link_id=${razorpay_payment_link_id || ''}&status=${razorpay_payment_link_status || 'unknown'}`;
            }

            console.log('🔵 Redirecting to:', redirectUrl);
            res.redirect(302, redirectUrl);
        } catch (error: any) {
            console.error('🔴 PAYMENT CALLBACK ERROR:', {
                message: error.message,
                stack: error.stack,
                query: req.query,
                url: req.url,
            });

            const fallbackUrl = `homzy://payment/error?timestamp=${Date.now()}`;
            console.log('🔵 Fallback redirect to:', fallbackUrl);
            res.redirect(302, fallbackUrl);
        }
    };
}

export default paymentController;
