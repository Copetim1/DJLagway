import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const trackSummary = { select: { title: true, artist: true, artworkUrl: true } };

// POST /mix-sessions - Save a completed mix session entry
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { trackAId, trackBId, effectUsed, startedAt, endedAt } = req.body;

    if (typeof trackAId !== 'string' || typeof trackBId !== 'string') {
      return res.status(400).json({ error: 'trackAId and trackBId are required' });
    }

    // Both decks may hold the same track, so compare against the distinct ids.
    const trackIds = [...new Set([trackAId, trackBId])];
    const usableCount = await prisma.track.count({
      where: { id: { in: trackIds }, OR: [{ ownerId: userId }, { ownerId: null }] },
    });
    if (usableCount !== trackIds.length) {
      return res.status(400).json({ error: 'trackAId and trackBId must be your tracks or starter tracks' });
    }

    const mixSession = await prisma.mixSession.create({
      data: {
        userId,
        trackAId,
        trackBId,
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
    const userId = req.user!.userId;

    const sessions = await prisma.mixSession.findMany({
      where: { userId },
      include: { trackA: trackSummary, trackB: trackSummary },
      orderBy: { startedAt: 'desc' },
    });

    return res.status(200).json(sessions);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch mix history' });
  }
});

export default router;