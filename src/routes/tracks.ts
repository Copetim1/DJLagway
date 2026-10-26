import{ Router, Response } from 'express';
import prisma from '../lib/prisma';
import{ requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /tracks/starter - public: the starter library, no login needed
router.get('/starter', async (_req, res: Response) =>{
  try{
    const tracks = await prisma.track.findMany({
      where:{ ownerId: null },
      orderBy:{ title: 'asc' },
    });

    return res.status(200).json(tracks);
  } catch (error){
    return res.status(500).json({ error: 'Failed to fetch starter tracks' });
  }
});

// GET /tracks - returns the starter library + the logged-in user's uploads
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) =>{
  try{
    const userId = req.user!.userId;

    const tracks = await prisma.track.findMany({
      where:{
        OR: [
         { ownerId: userId },       // User's own uploads
         { ownerId: null },         // Starter library
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