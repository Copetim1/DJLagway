import{ Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import{ JWT_SECRET, JWT_EXPIRES_IN } from '../lib/config';
import{ requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /auth/register
router.post('/register', async(req, res) =>{
  try{
    const{ email, username, password, role } = req.body;

    if(!email || !username || !password){
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data:{
        email,
        username,
        passwordHash,
        role: role === 'Experienced' ? 'Experienced' : 'Beginner',
      },
    });

    return res.status(201).json({
      message: 'User registered successfully',
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
  } catch(error: any){
    if(error.code === 'P2002'){
      return res.status(409).json({ error: 'Email or username already exists' });
    }
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /auth/login
router.post('/login', async(req, res) =>{
  try{
    const{ email, password } = req.body;

    if(!email || !password){
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where:{ email } });
    if(!user){
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if(!isPasswordValid){
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
     { userId: user.id, role: user.role },
      JWT_SECRET,
     { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user:{
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch(error){
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, async(req: AuthenticatedRequest, res: Response) =>{
  try{
    const userId = req.user?.userId;
    const user = await prisma.user.findUnique({
      where:{ id: userId },
      select:{ id: true, email: true, username: true, role: true, createdAt: true },
    });

    if(!user){
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch(error){
    return res.status(500).json({ error: 'Internal server error fetching user info' });
  }
});

export default router;