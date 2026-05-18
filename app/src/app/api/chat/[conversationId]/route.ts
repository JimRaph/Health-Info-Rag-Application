
import { NextRequest, NextResponse } from 'next/server'
import { auth } from "@/lib/auth";
import { prisma } from '@/lib/db'


interface Context {
  params: Promise<{ conversationId: string }>
}

export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }


    const { conversationId } = await context.params


    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(conversation.messages.map((message) => ({
      ...message,
      source: message.source ? JSON.parse(message.source): [],
    })))
  } catch (error) {
    console.error('Conversation Messages API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}