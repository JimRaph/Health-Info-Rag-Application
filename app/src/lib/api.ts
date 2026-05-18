import { env } from 'process';
import { Message } from '@/types/chat';
import { InferenceAPIRequest, InferenceAPIResponse, RagResponse } from '@/types/api';

export type RagQuery = InferenceAPIRequest;


class APIClient {
  private baseURL: string;
  
  constructor() {
    this.baseURL = env.RAG_SERVICE_URL || 'http://rag-service:8000';
    
    if (this.baseURL.includes('localhost') && env.NODE_ENV !== 'development') {
        console.warn('APIClient is connecting to localhost in a non-development environment.');
    }
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(env.RAG_SERVICE_API_KEY && { 
          'Authorization': `Bearer ${env.RAG_SERVICE_API_KEY}`
        }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        console.log('HELLO WORLD')
        const errorText = await response.text();
        let errorDetail = `Unknown error occurred. Status: ${response.status}`;
        
        try {
            const jsonError = JSON.parse(errorText);
            errorDetail = jsonError.detail || JSON.stringify(jsonError);
        } catch (e) {
            errorDetail = response.statusText;
            console.log('Error parsing error text lib api: ', e)
        }
        console.log('rradd ', this.baseURL)
        throw new Error(`API Error ${response.status}: ${errorDetail}`);
      }
      
      return await response.json();
    } catch (error) {
      console.log('radd ', this.baseURL)
      console.error('API Request Failed:', error);
      throw error;
    }
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
    });
  }
}

const apiClient = new APIClient();


export async function healthCheck(): Promise<boolean> {
  try {
    // await apiClient.get('/health');
    return true;
  } catch {
    return false;
  }
}

export async function getRagAnswer(
    latestQuery: string, 
    conversationHistory: Message[],
    // convId?: string
): Promise<RagResponse> {
    
    const serviceHistory = conversationHistory.map(m => ({
        role: m.role,
        content: m.content
    }));
    
    const data: InferenceAPIRequest = { 
        query: latestQuery, 
        history: serviceHistory,
        // conversation_id: convId,
        stream: false
    };
    
    const rawResponse = await apiClient.post<InferenceAPIResponse>('', data);
    
    return {
        answer: rawResponse.answer,
        sources: rawResponse.sources.map(url => ({ 
            title: url.split('/').pop() || 'Source Document', 
            url: url 
        })),
    }; 
}
