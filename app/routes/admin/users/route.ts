import express from 'express';
import adminUsersController from './controller';

const router = express.Router();
const controller = new adminUsersController();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.patch('/:id', controller.update);

export default router;
