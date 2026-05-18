

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  conversationId?: string  
  createdAt: Date | string
  source?: any[]
}

export interface Conversation {
  id: string
  title: string
  userId: string
  createdAt: Date
  updatedAt: Date
  messages: Message[]
}

export interface ChatRequest {
  message: string
  conversationId?: string
  history?: Message[]
}

export interface ChatResponse {
  response: string
  conversationId: string
  sources: Record<string, string>[]
}