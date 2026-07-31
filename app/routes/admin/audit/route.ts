import express from 'express';
import adminAuditController from './controller';

const router = express.Router();
const controller = new adminAuditController();

router.get('/', controller.list);

export default router;
