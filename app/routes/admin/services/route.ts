import express from 'express';
import { parseSingleUpload, uploadSingleFileToS3 } from '../../../middleware/uploadToS3';
import adminServicesController from './controller';

const router = express.Router();
const controller = new adminServicesController();

router.get('/', controller.list);
router.post('/', controller.create);
router.post(
    '/upload',
    parseSingleUpload('file'),
    uploadSingleFileToS3('services'),
    controller.upload,
);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);
router.post('/:id/slots', controller.createSlot);
router.patch('/:id/slots/:slotId', controller.updateSlot);
router.delete('/:id/slots/:slotId', controller.deleteSlot);

export default router;
