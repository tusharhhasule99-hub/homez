import express from 'express';
import paymentService from '../payments/service';
import { verifyWebhookSignature } from '../../services/razorpay';

const router = express.Router();
const service = new paymentService();

type RazorpayWebhookBody = {
    event?: string;
    payload?: Record<string, unknown>;
};

router.post('/', async (req: express.Request, res: express.Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const signature = req.get('x-razorpay-signature');

    if (!verifyWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    let body: RazorpayWebhookBody;
    try {
        body = JSON.parse(rawBody) as RazorpayWebhookBody;
    } catch {
        return res.status(400).json({ success: false, message: 'Invalid webhook JSON.' });
    }

    const event = body.event?.trim();
    if (!event || !body.payload) {
        return res.status(400).json({ success: false, message: 'Missing webhook event or payload.' });
    }

    try {
        await service.handleWebhookEvent(event, body.payload);
        return res.status(200).json({ success: true });
    } catch (e) {
        console.error('[webhooks/razorpay]', e);
        return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
    }
});

export default router;
