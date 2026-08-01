import express from 'express';
import adminAdminsController from './controller';

const router = express.Router();
const controller = new adminAdminsController();

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);

export default router;
