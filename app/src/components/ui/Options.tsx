import { Conversation } from '@/types/chat';
import React, { Dispatch, SetStateAction } from 'react'

interface OptionsProps {
  handleDelete: (event: React.MouseEvent) => void;
  conversation: Conversation;
  removeModal: Dispatch<SetStateAction<boolean>>
}

const Options = ({handleDelete, conversation, removeModal}: OptionsProps) => {

  function truncateTitle(title: string, length: number = 20): string {
    if(title.length > length) {
      return title.slice(0, length) + '...';
    }
    return title;
  }

  return (
    <div className='z-50 inset-0 fixed flex justify-center text-gray-600
    rounded-md shadow-lg bg-gray-500/90 items-center'
      >
        <div className='bg-gray-200 border border-gray-300 rounded-2xl p-4 cursor-default'>
          <p>Are you sure you want to delete this conversation?</p>
          <h2>This will delete <span className='font-semibold'>{truncateTitle(conversation.title)}</span></h2>
          <div className='flex justify-end space-x-2 mt-2'>
            <span className='bg-red-700 cursor-pointer p-2 py-1 text-gray-50 rounded-sm' 
              onClick={handleDelete}>
                Delete
            </span>
            <span className='border border-gray-400 cursor-pointer p-2 py-1 rounded-sm' 
              onClick={()=>removeModal(false)}>
              Cancel
            </span>
          </div>
        </div>
   
    </div>
  )
}

export default Options
