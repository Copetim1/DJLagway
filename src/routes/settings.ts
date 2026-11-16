import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

router.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, role } = req.user!;
  const { preferredEffect, gestureSensitivity, swapHands, mirrored, smoothing } = req.body;

  if (role === 'Beginner') {
    const tryingNonLowpass = preferredEffect !== undefined && preferredEffect.toLowerCase() !== 'lowpass';
    const tryingTrackingChange = swapHands !== undefined || mirrored !== undefined || smoothing !== undefined || gestureSensitivity !== undefined;

    if (tryingNonLowpass || tryingTrackingChange) {
      return res.status(403).json({
        error: 'Beginners can only use the lowpass effect and cannot modify tracking settings',
      });
    }
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (preferredEffect !== undefined) updateData.preferredEffect = preferredEffect;
    if (gestureSensitivity !== undefined) updateData.gestureSensitivity = gestureSensitivity;
    if (swapHands !== undefined) updateData.swapHands = swapHands;
    if (mirrored !== undefined) updateData.mirrored = mirrored;
    if (smoothing !== undefined) updateData.smoothing = smoothing;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData },
    });
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user settings' });
  }
});

export default router;