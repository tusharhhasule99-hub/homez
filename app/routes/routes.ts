import express from 'express';
import { authenticateJwt } from '../middleware/authenticateJwt';
import addressRoutes from './addresses/route';
import authRoutes from './auth/route';
import bookingRoutes from './bookings/route';
import discountRoutes from './discounts/route';
import serviceRoutes from './services/route';
import staffRoutes from './staff/route';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/addresses', authenticateJwt, addressRoutes);
router.use('/bookings', authenticateJwt, bookingRoutes);
router.use('/services', authenticateJwt, serviceRoutes);
router.use('/discounts', authenticateJwt, discountRoutes);
router.use('/staff', staffRoutes);

export default router;