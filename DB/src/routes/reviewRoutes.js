import { Router } from 'express';
import * as reviewController from '../controller/reviewController.js';
import { protect } from '../middleware/protect.js';

const router = Router();

router.post('/', protect, reviewController.createReview);
router.get('/user/:userId', protect, reviewController.getUserReviews);

export default router;
