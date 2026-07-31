import express from 'express';
import adminAnalyticsController from './controller';

const router = express.Router();
const controller = new adminAnalyticsController();

router.get('/overview', controller.overview);

export default router;
