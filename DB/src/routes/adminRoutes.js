import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import { adminOnly } from '../middleware/admin.js';
import {
  blockUser,
  getAdminStats,
  getAllReports,
  getAllRides,
  getAllUsers,
  makeAdmin,
  unblockUser,
  updateReportStatus,
  updateRideStatus,
} from '../controllers/adminController.js';

const router = Router();

router.use(protect, adminOnly);

router.get('/stats', getAdminStats);
router.get('/users', getAllUsers);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unblock', unblockUser);
router.patch('/users/:id/make-admin', makeAdmin);

router.get('/rides', getAllRides);
router.patch('/rides/:id/status', updateRideStatus);

router.get('/reports', getAllReports);
router.patch('/reports/:id/status', updateReportStatus);

export default router;
