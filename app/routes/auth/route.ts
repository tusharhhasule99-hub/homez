import express from 'express';
import authController from './controller';
import { authenticateJwt } from '../../middleware/authenticateJwt';

const router = express.Router();
const controller = new authController();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/verify', controller.verify);
router.post('/onboarding', authenticateJwt, controller.onboarding);

export default router;