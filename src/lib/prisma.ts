import { PrismaClient } from '@prisma/client';

// One client for the whole app; each PrismaClient opens its own connection pool.
const prisma = new PrismaClient();

export default prisma;
