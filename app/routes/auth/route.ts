import express from 'express';
import authController from './controller';

const router = express.Router();
const controller = new authController();

router.post('/register', controller.register);

export default router;