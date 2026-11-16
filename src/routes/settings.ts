import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { isSupportedEffect } from '../lib/effects';
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
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const { preferredEffect, gestureSensitivity, swapHands, mirrored, smoothing } = req.body;

  if (preferredEffect !== undefined && !isSupportedEffect(preferredEffect)) {
    return res.status(400).json({ error: 'preferredEffect must be lowpass, highpass, or echo' });
  }
  if (swapHands !== undefined && typeof swapHands !== 'boolean') {
    return res.status(400).json({ error: 'swapHands must be a boolean' });
  }
  if (mirrored !== undefined && typeof mirrored !== 'boolean') {
    return res.status(400).json({ error: 'mirrored must be a boolean' });
  }
  if (
    gestureSensitivity !== undefined &&
    (typeof gestureSensitivity !== 'number' ||
      !Number.isFinite(gestureSensitivity) ||
      gestureSensitivity < 0 ||
      gestureSensitivity > 1)
  ) {
    return res.status(400).json({ error: 'gestureSensitivity must be a number between 0 and 1' });
  }
  if (
    smoothing !== undefined &&
    (typeof smoothing !== 'number' ||
      !Number.isFinite(smoothing) ||
      smoothing < 0 ||
      smoothing > 1)
  ) {
    return res.status(400).json({ error: 'smoothing must be a number between 0 and 1' });
  }

  if (role === 'Beginner') {
    const tryingNonLowpass = preferredEffect !== undefined && preferredEffect !== 'lowpass';
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