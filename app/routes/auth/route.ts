import express from 'express';
import authController from './controller';
import { authenticateJwt } from '../../middleware/authenticateJwt';

const router = express.Router();
const controller = new authController();

router.post('/login', controller.login);
router.post('/resend-otp', controller.resendOtp);
router.post('/verify', controller.verify);
router.get('/user', authenticateJwt, controller.getUser);
router.post('/onboarding', authenticateJwt, controller.onboarding);

export default router;