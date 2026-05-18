'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Conversation } from '@/types/chat' 

interface UseConversationsReturn {
    conversations: Conversation[]
    currentConversation: Conversation | null
    selectConversation: (conversation: Conversation | null) => void
    createNewConversation: () => void
    isLoadingConversations: boolean
    deleteConversation: (conversationId: string) => void 
    isDeletingConversation: boolean
    conversationDeleteError: string | null
    responseMsg: string | null,
    clearResponseMessages: () => void 
}

const storedconversationkey = 'stored:conversation'

export function useConversations(userId?: string | null): UseConversationsReturn {
 const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
 const [conversationDeleteError, setConversationDeleteError] = useState<string | null>(null);
 const [responseMsg, setResponseMsg] = useState<string | null>(null);
 const queryClient = useQueryClient()


 const { data: conversations = [], isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations', userId],
    queryFn: async (): Promise<Conversation[]> => {
    const response = await fetch('/api/conversations')
    if (!response.ok) {
        throw new Error('Failed to fetch conversations')
    }
    return response.json()
},
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, 
 })



useEffect(() => {
  if (conversations.length === 0) return;

  const storedConversationId =
    typeof window !== "undefined"
      ? localStorage.getItem(storedconversationkey)
      : null;
  if (!storedConversationId) return;

  const match = conversations.find((c) => c.id === storedConversationId);

  if (match) {
    if (currentConversation?.id !== match.id) {
      setCurrentConversation(match);
    }
  } else {
    localStorage.removeItem(storedconversationkey);
    if (currentConversation?.id === storedConversationId) {
      setCurrentConversation(null);
    }
  }
}, [conversations, currentConversation]);




 const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
        const response = await fetch(`/api/conversations/${conversationId}`,{
            method: 'DELETE',
        })
        if (!response.ok){
            throw new Error('Failed to delete conversation')
        }

        const responseMessage = await response.text()
        return responseMessage
    },

    onSuccess: (responseMessage, conversationId) => {
        setResponseMsg(responseMessage)
        queryClient.invalidateQueries({queryKey: ['conversations', userId]})

        if (currentConversation?.id === conversationId) {
            setCurrentConversation(null)
            localStorage.removeItem(storedconversationkey)
        }

        queryClient.removeQueries({queryKey: ['messages', conversationId]})
        window.dispatchEvent(new CustomEvent('cancel-active-mutation'))
    },

    onError: (error) => {
        setConversationDeleteError('Error deleting conversation, try again later')
        // console.error('Error deleting conversation: ', error)
    }
 })


 const selectConversation = useCallback((conversation: Conversation | null) => {
    setCurrentConversation(conversation)
    // console.log('convo ', conversation)
    if(conversation?.id){
        try{
            // console.log('check')
            localStorage.setItem(storedconversationkey, conversation.id)
        } catch(e) {
            // console.log('chec')
            console.log('Error setting current conversation: ', e)
        }
    } else {
        try {
            // console.log('che')
            localStorage.removeItem(storedconversationkey)
        } catch(e) {
            // console.log('ch')
             console.log('Error removing current conversation: ', e)
        }
    }
 }, [])

 const createNewConversation = useCallback(() => {
    setCurrentConversation(null); 

    try {
        localStorage.removeItem(storedconversationkey)
    } catch (e) {
         console.log('Error removing current conversation: ', e)
    }

    queryClient.removeQueries({queryKey: ['messages']})
    queryClient.cancelQueries({queryKey: ['messages']})

    window.dispatchEvent(new CustomEvent("cancel-active-mutation"));

    setResponseMsg(null)
    setConversationDeleteError(null)
 }, [queryClient])

 const deleteConversation = useCallback((conversationId: string) => {
    deleteConversationMutation.mutate(conversationId)
 }, [deleteConversationMutation])

 const clearResponseMessages = () => {
    setResponseMsg(null);
    setConversationDeleteError(null);
};

 return {
  conversations,
  currentConversation,
  selectConversation,
  createNewConversation,
  isLoadingConversations,
  deleteConversation,
  isDeletingConversation: deleteConversationMutation.isPending,
  conversationDeleteError,
  responseMsg,
  clearResponseMessages
 }
}