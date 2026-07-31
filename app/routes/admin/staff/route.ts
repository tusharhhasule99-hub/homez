import express from 'express';
import adminStaffController from './controller';

const router = express.Router();
const controller = new adminStaffController();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id/kyc', controller.updateKyc);
router.patch('/:id', controller.update);
router.get('/:id', controller.getById);

export default router;
