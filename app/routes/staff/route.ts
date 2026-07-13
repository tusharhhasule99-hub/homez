import express from 'express';
import staffController from './controller';
import jobsRoutes from './jobs/route';
import { authenticateStaffJwt } from '../../middleware/authenticateStaffJwt';
import { parseSingleUpload, uploadSingleFileToS3 } from '../../middleware/uploadToS3';

const router = express.Router();
const controller = new staffController();

router.post('/login', controller.login);
router.post('/register', controller.register);
router.post('/resend-otp', controller.resendOtp);
router.post('/verify-otp', controller.verifyOtp);
router.post('/upload', authenticateStaffJwt, parseSingleUpload('file'), uploadSingleFileToS3('staff'), controller.upload);

router.post('/location', authenticateStaffJwt, controller.updateLocation);
router.patch('/availability', authenticateStaffJwt, controller.setAvailability);
router.use('/jobs', jobsRoutes);

export default router;
