import dotenv from 'dotenv'
dotenv.config()

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log(' Starting database seed...')
  
  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      hashedPassword: hashedPassword,
      emailVerified: new Date(),
    },
  })
  
  console.log('reated test user:', user.email)
  
  const conversation = await prisma.conversation.create({
    data: {
      title: 'Sample Health Question',
      userId: user.id,
      messages: {
        create: [
          {
            role: 'user',
            content: 'What are the symptoms of COVID-19?',
            source: JSON.stringify([])
          },
          {
            role: 'assistant', 
            content: 'Common symptoms of COVID-19 include fever, cough, \
            and difficulty breathing. However, symptoms can vary. Please \
            consult WHO guidelines for the most current information \
            .',
            source: JSON.stringify(
              [
                {
                  title: 'coronavirus-disease-(covid-19)',                                                                     
                  url: 'https://www.who.int/news-room/fact-sheets/detail/coronavirus-disease-(covid-19)'                       
                }
              ]    
            ),     
          },
        ],
      },
    },
  })
  
  console.log('Created sample conversation ', conversation)
  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
