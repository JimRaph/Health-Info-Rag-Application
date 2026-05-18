'use client'

import { Conversation } from '@/types/chat'
import { PlusIcon } from '@heroicons/react/24/outline'
import { ConversationItem } from '../ui/ConversationItem'
import { Bars3Icon } from '@heroicons/react/24/solid'
import { useComp } from '@/stores/compStore'

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onCreateNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  isDeletingConversation: boolean;
  isLoadingConversations: boolean;
  setInput: (value: string) => void;
}

export function ConversationSidebar({
  conversations,
  currentConversation,
  onSelectConversation,
  onCreateNewConversation,
  onDeleteConversation,
  isDeletingConversation,
  isLoadingConversations,
  setInput
}: ConversationSidebarProps) {

  // console.log('Conversation: ', conversations)
  const setSidebarOpen = useComp((state) => state.setSidebarOpen)

  return (
    <div className="w-80  border-r border-gray-200 flex flex-col">
      <div className="lg:hidden flex items-center justify-between px-3 h-13">
        <div className="p-2 ">
          <button
            className="p-2 rounded-md text-gray-700 hover:bg-blue-100 hover:text-blue-600 transition-colors duration-200 "
            onClick={() => setSidebarOpen(false)}
            aria-label="Open sidebar"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
        </div>
        <h1 className="text-md font-semibold text-blue-600 hover:cursor-default">
          MediFact
        </h1>
      </div>

      <div className="p-4 border-t border-b border-gray-200">
        <button
          onClick={() => {
            setInput("");
            onCreateNewConversation();
          }}
          className={`flex items-center justify-center w-full px-4 py-2 text-sm font-medium
             text-white rounded-md transition-colors focus:outline-none focus:ring-2 
             focus:ring-offset-2 ${"bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"}`}
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          New Conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-scroll scrollbar-thin ">
        {isLoadingConversations && conversations.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-400 animate-pulse">
            Loading conversations...
          </div>
        )}

        {isLoadingConversations && (
          <div className="p-2 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-blue-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        <div className="p-2 space-y-1 ">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={currentConversation?.id === conversation.id}
              onSelect={onSelectConversation}
              onDelete={onDeleteConversation}
              isDisabled={isDeletingConversation}
            />
          ))}
        </div>
      </div>
    </div>
  );

}