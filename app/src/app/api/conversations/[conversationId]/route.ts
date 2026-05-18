import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: {params: Promise<{conversationId: string}>}
){
  const session = await auth();

  if(!session || !session.user || !session?.user.id) {
    return new NextResponse('Unathorized', {status: 401});
  }

  const {conversationId} =  await context.params 

  if(!conversationId){
    console.error('ConversationId is required')
    return new NextResponse('ConversationId is missing', {status: 400})
  }

  try{
    await prisma.conversation.delete({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    });

    return new NextResponse('Conversation deleted', {status: 200});
  } catch(error) {
    console.error('Error deleting conversation: ', error)
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'){
      if (error.code === 'P2025') {
    return new NextResponse('Conversation not found or unauthorized', { status: 404 });
  }
    }
    return new NextResponse('Server error, try again', {status: 500})
  }
}