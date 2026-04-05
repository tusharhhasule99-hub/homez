import express from 'express';
import { authenticateJwt } from '../middleware/authenticateJwt';
import authRoutes from './auth/route';
import discountRoutes from './discounts/route';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/discounts', authenticateJwt, discountRoutes);

export default router;