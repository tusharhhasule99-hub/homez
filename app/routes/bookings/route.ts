import express from 'express';
import bookingController from './controller';

const router = express.Router();
const controller = new bookingController();

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/coupon', controller.applyCoupon);
router.patch('/:id/status', controller.updateStatus);
router.post('/:id/rating', controller.rate);
router.get('/:id', controller.getById);

export default router;
