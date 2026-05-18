import { auth } from "@/lib/auth";
import { redirect } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'


export default async function Dashboard() {
  const session = await auth();
  


  return (
    <div className='w-screen'>
         <ChatInterface user = {session?.user ?? null} />  
    </div>
  )
}