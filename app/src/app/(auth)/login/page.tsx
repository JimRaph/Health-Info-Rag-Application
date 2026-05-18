import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/auth/SignInForm'

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect('/')

  return (
    <div className="min-h-screen bg-sky-300 overflow-clip">
      <SignInForm />
    </div>
  )
}
