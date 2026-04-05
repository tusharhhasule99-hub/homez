import express from 'express';
import servicesController from './controller';

const router = express.Router();
const controller = new servicesController();

router.get('/', controller.list);
router.get('/:id', controller.getById);

export default router;
