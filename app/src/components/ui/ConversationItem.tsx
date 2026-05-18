'use client'

import { useEffect, useRef, useState } from 'react'
import { Conversation } from '@/types/chat'
import { formatDate } from '@/lib/utils'
import Options from './Options'
import { TrashIcon } from '@heroicons/react/24/outline'
import { Modal } from '@/components/Modal'

interface ConversationItemProps {
    conversation: Conversation
    isSelected: boolean
    onSelect: (conversation: Conversation ) => void
    onDelete: (conversationId: string) => void
    isDisabled: boolean
}

export function ConversationItem({
    conversation,
    isSelected,
    onSelect,
    onDelete,
    isDisabled,
}: ConversationItemProps) {
    const [showOptions, setShowOptions] = useState(false)
    const optionRef = useRef<HTMLDivElement>(null)
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)

    useEffect(()=>{
      function handleClickOutside(e: MouseEvent){
        if(optionRef.current && !optionRef.current.contains(e.target as Node)){
          setShowOptions(false)
        }
      }

      document.addEventListener('click', handleClickOutside)
      return ()=>{
        removeEventListener('click', handleClickOutside)
      }
    }, [optionRef])


    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation() 
        onDelete(conversation.id)
        setShowOptions(false)
    }

    return (
      <div className='relative'>
        <button
              key={conversation.id}
              onClick={() => onSelect(conversation)}
             
              disabled={isDisabled} 
              className={`w-full text-left px-3 py-2 text-sm rounded-md 
                transition-colors flex justify-between ${
                isDisabled ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-100'
              } ${
                isSelected
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'text-gray-700'
              }`}
            >
              <div >
                <div className="font-medium ">
                  <span className='truncate'>{conversation.title}</span> 
                </div>
                <div className="text-xs text-gray-500 mt-1">
        
                  {formatDate(conversation.updatedAt)} 
                </div>
              </div>
              <div className='relative' ref={optionRef}>

                <svg xmlns="http://www.w3.org/2000/svg" fill="none" 
                viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" 
                className="size-6"
                onClick={(e)=>{
                    e.stopPropagation()
                    setShowOptions(!showOptions)
                }}>
                  <path strokeLinecap="round" strokeLinejoin="round" 
                  d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
              </div>
             
            </button>
            
            <div >

              {
              showOptions && (
                <div className='z-10 w-23 absolute border-gray-300 border text-gray-600
                  rounded-md shadow-lg hover:bg-gray-200 bg-gray-50 cursor-pointer 
                  right-0'
                    onClick={()=>setShowDeleteConfirmation(!showDeleteConfirmation)}>
                    <span className='py-2 px-2 flex'>
                          <TrashIcon className='w-4'/>
                          <span className='text-md  ml-2 cursor-pointer'>Delete</span>
                      </span> 
                  </div>
              )
                }
            </div>

            <div>
              {showDeleteConfirmation && (
                <Modal>

                  <Options
                    conversation ={conversation} 
                    handleDelete={handleDelete}
                    removeModal={setShowDeleteConfirmation}
                    />

                </Modal>
              )}
            </div>

          </div>
    )
}
