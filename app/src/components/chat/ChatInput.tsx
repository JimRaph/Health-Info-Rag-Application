'use client'

import { PaperAirplaneIcon } from '@heroicons/react/24/outline'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
}

export function ChatInput({ input, setInput, onSubmit, isLoading }: ChatInputProps) {
  return (
    <div className="border-t border-gray-200 px-4 pt-4 pb-4 ">
      <form onSubmit={onSubmit} className="flex space-x-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your health question..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none
           focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-500"
          // disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="inline-flex items-center px-4 py-2 border border-transparent 
          text-sm font-medium rounded-md shadow-sm text-white bg-blue-600
           hover:bg-blue-700 focus:outline-none focus:ring-2 
           focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}