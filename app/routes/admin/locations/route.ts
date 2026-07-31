import express from 'express';
import adminLocationsController from './controller';

const router = express.Router();
const controller = new adminLocationsController();

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
