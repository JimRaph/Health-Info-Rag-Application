"use client";

import { signOut } from "next-auth/react";
import { User } from "next-auth";
import { Bars3Icon } from "@heroicons/react/24/solid";
import { useComp } from "@/stores/compStore";

interface DashboardHeaderProps {
  user: User | null;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const setSidebarOpen = useComp((state) => state.setSidebarOpen);

  return (
    <header className=" w-full bg-gray-50 border-b border-gray-200">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-xl text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            <div className="flex items-center cursor-default hover:cursor-default">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-100">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900 ml-0.5">
                edi
                <span className="text-blue-600 font-semibold">Fact</span>
              </h1>
            </div>
          </div>

          {/* rigth section */}
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-3 py-1 px-3 bg-gray-100 rounded-full border border-gray-100">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1">
                {user?.name || user?.email
                  ? user?.name || user?.email?.split("@")[0]
                  : "Guest"}
              </span>
              <div className="h-4 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                {/* <span className="text-sm font-semibold text-gray-700">
                  {user?.name || "User"}
                </span> */}
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white text-xs font-bold shadow-md ring-2 ring-white">
                    {(user?.name || user?.email)?.charAt(0).toUpperCase() ||
                      "A"}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (user?.name || user?.email) {
                  signOut({ callbackUrl: "/login" });
                } else {
                  window.location.href = "/login";
                }
              }}
              className="px-4 py-2 text-sm font-bold text-blue-600 hover:text-white border border-blue-100 hover:bg-blue-600 rounded-lg transition-all duration-200 shadow-sm hover:shadow-blue-100"
            >
              {user ? "Sign Out" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
