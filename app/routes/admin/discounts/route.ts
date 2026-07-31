import express from 'express';
import adminDiscountsController from './controller';

const router = express.Router();
const controller = new adminDiscountsController();

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
