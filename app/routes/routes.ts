import express from 'express';
import { authenticateJwt } from '../middleware/authenticateJwt';
import { authenticateAdminJwt } from '../middleware/authenticateAdminJwt';
import addressRoutes from './addresses/route';
import authRoutes from './auth/route';
import bookingRoutes from './bookings/route';
import paymentRoutes from './payments/route';
import PaymentController from './payments/controller';
import discountRoutes from './discounts/route';
import serviceRoutes from './services/route';
import staffRoutes from './staff/route';
import adminAuthRoutes from './admin/auth/route';
import adminUsersRoutes from './admin/users/route';
import adminStaffRoutes from './admin/staff/route';
import adminBookingsRoutes from './admin/bookings/route';
import adminServicesRoutes from './admin/services/route';
import adminLocationsRoutes from './admin/locations/route';

const router = express.Router();

router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/users', authenticateAdminJwt, adminUsersRoutes);
router.use('/admin/staff', authenticateAdminJwt, adminStaffRoutes);
router.use('/admin/bookings', authenticateAdminJwt, adminBookingsRoutes);
router.use('/admin/services', authenticateAdminJwt, adminServicesRoutes);
router.use('/admin/locations', authenticateAdminJwt, adminLocationsRoutes);
router.use('/auth', authRoutes);
router.use('/addresses', authenticateJwt, addressRoutes);
router.use('/bookings', authenticateJwt, bookingRoutes);
router.get('/payments/callback', new PaymentController().handlePaymentCallback);
router.use('/payments', authenticateJwt, paymentRoutes);
router.use('/services', authenticateJwt, serviceRoutes);
router.use('/discounts', authenticateJwt, discountRoutes);
router.use('/staff', staffRoutes);

export default router;