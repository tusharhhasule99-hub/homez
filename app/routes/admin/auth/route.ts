import express from 'express';
import adminAuthController from './controller';
import { authenticateAdminJwt } from '../../../middleware/authenticateAdminJwt';

const router = express.Router();
const controller = new adminAuthController();

router.post('/login', controller.login);
router.get('/me', authenticateAdminJwt, controller.me);

export default router;
