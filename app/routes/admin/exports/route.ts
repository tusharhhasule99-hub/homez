import express from 'express';
import adminExportsController from './controller';

const router = express.Router();
const controller = new adminExportsController();

router.get('/bookings', controller.bookings);
router.get('/users', controller.users);
router.get('/discounts', controller.discounts);

export default router;
