
import { DashboardHeader } from '@/components/layout/DashboardHeaders'
import { auth } from "@/lib/auth";


interface DashboardLayoutProps {
  children: React.ReactNode
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {

  const session = await auth();

  return (
    <div className="flex flex-col max-h-screen overflow-hidden">
      <DashboardHeader user={session?.user ?? null} />
      <div className="flex flex-1">
        {children}
      </div>
    </div>
  )
}