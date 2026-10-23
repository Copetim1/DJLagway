import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// POST /mix-sessions - Save a completed mix session entry
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { trackA, trackB, effectUsed, startedAt, endedAt } = req.body;

    if (!trackA || !trackB || !effectUsed) {
      return res.status(400).json({ error: 'Missing required mix session data' });
    }

    const mixSession = await prisma.mixSession.create({
      data: {
        userId: userId!,
        trackA,
        trackB,
        effectUsed,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        endedAt: endedAt ? new Date(endedAt) : new Date(),
      },
    });

    return res.status(201).json(mixSession);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to log mix session' });
  }
});

// GET /mix-sessions - Retrieve current user's past mix sessions
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const sessions = await prisma.mixSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });

    return res.status(200).json(sessions);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch mix history' });
  }
});

export default router;