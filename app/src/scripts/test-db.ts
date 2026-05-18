import { prisma } from '@/lib/db'
import dotenv from 'dotenv'
dotenv.config()

async function testConnection() {
  try {
    console.log('test database connection...')
    
    await prisma.$queryRaw`SELECT 1 as connected`
    console.log('db connection successful!')
    
    const userCount = await prisma.user.count()
    console.log(`users in database: ${userCount}`)
    
  } catch (error) {
    console.error('db connection failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()