import express from 'express';
import authController from './controller';

const router = express.Router();
const controller = new authController();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/verify', controller.verify);

export default router;