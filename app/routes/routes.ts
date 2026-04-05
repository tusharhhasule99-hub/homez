import express from 'express';
import { authenticateJwt } from '../middleware/authenticateJwt';
import addressRoutes from './addresses/route';
import authRoutes from './auth/route';
import discountRoutes from './discounts/route';
import serviceRoutes from './services/route';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/addresses', authenticateJwt, addressRoutes);
router.use('/services', authenticateJwt, serviceRoutes);
router.use('/discounts', authenticateJwt, discountRoutes);

export default router;