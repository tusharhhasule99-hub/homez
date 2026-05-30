import express from 'express';
import adminBookingsController from './controller';

const router = express.Router();
const controller = new adminBookingsController();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.patch('/:id/status', controller.updateStatus);

export default router;
