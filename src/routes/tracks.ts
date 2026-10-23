import{ Router, Response } from 'express';
import{ PrismaClient } from '@prisma/client';
import{ requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
// GET /tracks - returns user's personal uploads + seeded tracks
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) =>{
  try{
    const userId = req.user?.userId;

    const tracks = await prisma.track.findMany({
      where:{
        OR: [
         { ownerId: userId },       // User's own uploads
         { source: 'iTunes' },      // Public seeded tracks
        ],
      },
      orderBy:{ title: 'asc' },
    });

    return res.status(200).json(tracks);
  } catch (error){
    return res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

export default router;