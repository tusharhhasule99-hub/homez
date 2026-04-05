import express from 'express';
import discountController from './controller';

const router = express.Router();
const controller = new discountController();

/** `is_active` and not `is_deleted`; unexpired; capped offers hidden when uses hit the limit (`null` limit = unlimited). */
router.get('/', controller.list);
router.get('/code/:code', controller.getByCode);

export default router;
