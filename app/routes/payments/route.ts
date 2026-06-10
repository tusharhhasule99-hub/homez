import express from 'express';
import paymentController from './controller';

const router = express.Router();
const controller = new paymentController();

router.post('/bookings/:bookingId', controller.createForBooking);
router.get('/bookings/:bookingId/status', controller.getStatusForBooking);

export default router;
