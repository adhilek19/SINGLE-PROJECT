import { Router } from 'express';
import * as reportController from '../controller/reportController.js';
import { protect } from '../middleware/protect.js';

const router = Router();

router.post('/', protect, reportController.createReport);

export default router;
