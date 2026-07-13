import express from 'express';
import staffJobsController from './controller';
import { authenticateStaffJwt } from '../../../middleware/authenticateStaffJwt';

const router = express.Router();
const controller = new staffJobsController();

router.get('/stream', authenticateStaffJwt, controller.stream);
router.get('/offers', authenticateStaffJwt, controller.listOffers);
router.post('/:offerId/accept', authenticateStaffJwt, controller.accept);
router.post('/:offerId/decline', authenticateStaffJwt, controller.decline);

export default router;
