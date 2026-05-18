"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Conversation, Message, ChatRequest } from "@/types/chat";
import { toast } from "react-toastify";
import { flushSync } from "react-dom";


interface UseChatProps {
  currentConversation: Conversation | null;
  userId: string | null;
  onNewConversationCreated?: (newId: string) => void;
}

interface UseChatReturn {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isSending: boolean;
  isLoadingHistory: boolean;
  // cancelSending: () => void;
  // pendingConversationId: string | null;
  status: string | null;
}

export const activityRef = {current: () => {}}

export function useChat({
  currentConversation,
  userId,
  onNewConversationCreated,
}: UseChatProps): UseChatReturn {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tempMessages, setTempMessages] = useState<Message[]>([]);
  const [pendingConversationId, setPendingConversationId] = useState<
    string | null
  >(null);
  const queryClient = useQueryClient();

  if (!(globalThis as any).__CHAT_CONTROLLERS__) {
    (globalThis as any).__CHAT_CONTROLLERS__ = new Map<
      string,
      AbortController
    >();
  }

  const { data: messages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["messages", currentConversation?.id],
    queryFn: async (): Promise<Message[]> => {
      console.log("currentConversation?.id: ", currentConversation?.id);
      const response = await fetch(`/api/chat/${currentConversation!.id}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!currentConversation?.id,
    // initialData: [],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (
      message: string,
    ): Promise<{
      conversationId: string | null;
      sources: string[];
    }> => {
      const ctrl = new AbortController();
      const map: Map<string, AbortController> = (globalThis as any)
        .__CHAT_CONTROLLERS__;
      const mapKey = currentConversation?.id || "temp";
      map.set(mapKey, ctrl);

      console.log("from mutationfn currentconversation: ", currentConversation);
      const currentMessages = currentConversation?.id ? messages : tempMessages;

      const requestBody: ChatRequest = {
        message,
        conversationId: currentConversation?.id,
        history: currentMessages.slice(0, -1),
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: ctrl.signal,
      });

      console.log("response from fetch: ", JSON.stringify(response));
      console.log("response from fetch not stringified: ", response);
      map.delete(mapKey);

      if (!response.ok) {
        let errorMessage = "Failed to send message";
        try {
          const err = await response.json();
          errorMessage = err.error || err.message || errorMessage;
        } catch {
          errorMessage = `API Error:  ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setStatus(null);

      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        content: "",
        role: "assistant",
        createdAt: new Date().toISOString(),
        source: [],
      };

      if (!currentConversation?.id) {
        setTempMessages((prev) => [...prev, assistantMsg]);
      } else {
        queryClient.setQueryData<Message[]>(
          ["messages", currentConversation.id],
          (old = []) => [...old, assistantMsg],
        );
      }

      const contentType = response.headers.get("content-type") || "";

      // non streaming 
      // if (contentType.includes("application/json")) {
      //   const data = await response.json();

      //   // FIX: Check multiple possible text fields
      //   const text =
      //     data.answer ||
      //     data.response ||
      //     data.text ||
      //     data.message ||
      //     data.content ||
      //     data.data ||
      //     "";

      //   // If text is still empty, log for debugging
      //   if (!text) {
      //     console.warn(
      //       "Empty text from JSON response. Response keys:",
      //       Object.keys(data),
      //     );
      //   }

      //   console.log("THE CONTENT TYPE RUNS");

      //   if (!currentConversation?.id) {
      //     setTempMessages((prev) =>
      //       prev.map((m) =>
      //         m.id === assistantId
      //           ? { ...m, content: text, source: data.sources as string[] }
      //           : m,
      //       ),
      //     );
      //   } else {
      //     queryClient.setQueryData<Message[]>(
      //       ["messages", currentConversation.id],
      //       (old = []) =>
      //         old.map((m) =>
      //           m.id === assistantId
      //             ? { ...m, content: text, source: data.sources as string[] }
      //             : m,
      //         ),
      //     );
      //   }

      //   return {
      //     conversationId: data.conversationId || null,
      //     sources: data.sources || [],
      //   };
      // }

      // streaming
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let finalConversationId: string | null = null;
      let finalSources: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        console.log("SSE buffer:", JSON.stringify(buffer));
        console.log("SSE events:", events);
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }

          console.log(
            "Processing event:",
            JSON.stringify(event),
            "type:",
            eventType,
            "data:",
            dataStr,
          );
          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);

            switch (eventType) {
              case "meta": {
                // console.log("finalsources meta: ", finalsources);
                // if (payload.conversationId)
                // finalConversationId = payload.conversationId;
                finalSources = payload.sources || [];
                // console.log("finalsources meta: ", finalSources);
                break;
              }
              case "status": {
                flushSync(() => {
                  setStatus(payload.step || null);
                });
                break;
              }
              case "token": {
                // console.log("finalsources token: ", finalSources);
                const text = payload.text || "";
                if (!currentConversation?.id) {
                  // console.log("finalsources: ", finalSources);
                  flushSync(() => {
                    setTempMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: m.content + text,
                              source: finalSources,
                            }
                          : m,
                      ),
                    );
                  });
                } else {
                  flushSync(() => {
                    // console.log(
                    //   "THERE IS currentConversation",
                    //   currentConversation,
                    // );
                    queryClient.setQueryData<Message[]>(
                      ["messages", currentConversation.id],
                      (old = []) =>
                        old.map((m) =>
                          m.id === assistantId
                            ? {
                                ...m,
                                content: m.content + text,
                                source: finalSources as string[],
                              }
                            : m,
                        ),
                    );
                  });
                }
                break;
              }
              case "done": {
                if (payload.conversationId)
                  finalConversationId = payload.conversationId;
                break;
              }
              case "error": {
                throw new Error(payload.message || "Stream error");
              }
            }
          } catch {
          }
        }
      }

      return {
        conversationId: finalConversationId,
        sources: finalSources,
      };
    },

    onMutate: async (message) => {
      // setStatus(null);
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: message,
        role: "user",
        createdAt: new Date().toISOString(),
        source: [],
      };

      const convKey = currentConversation?.id ?? "temp";
      // console.log(
      //   "from onmutate currentconversation: ",
      //   currentConversation?.id,
      // );
      setPendingConversationId(convKey);

      if (!currentConversation?.id) {
        setTempMessages((prev) => [...prev, newMessage]);
      } else {
        queryClient.setQueryData<Message[]>(
          ["messages", currentConversation.id],
          (old = []) => [...old, newMessage],
        );
      }

      setInput("");
      activityRef.current()
      setStatus("searching_documents");
      return {
        convKey,
        previousTempMessages: tempMessages,
        previousMessages:
          queryClient.getQueryData<Message[]>([
            "messages",
            currentConversation?.id,
          ]) ?? messages,
      };
    },

    onSuccess: async (data, _variables, context) => {
      setStatus(null);

      if (data.conversationId && !currentConversation) {
        // console.log(
        //   "from onSuccess create newConversation: ",
        //   data.conversationId,
        // );
        onNewConversationCreated?.(data.conversationId);
        queryClient.setQueryData<Message[]>(
          ["messages", data.conversationId],
          (old = []) => [...tempMessages, ...(old || [])],
        );
        setTempMessages([]);
        if (userId) {
          queryClient.invalidateQueries({
            queryKey: ["conversations", userId],
          });
        }
      }

      setPendingConversationId(null);
      const map: Map<string, AbortController> = (globalThis as any)
        .__CHAT_CONTROLLERS__;
      map.delete(context?.convKey ?? "temp");
    },

    onError: (err, _variables, context) => {
      // console.error("Message Send Error:", err);
      // toast.error(err.message);

      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message?.toLowerCase().includes("abort"));

      if (!isAbort) {
        console.error("Message Send Error:", err);
        toast.error(err.message || "Failed to send message");
      }

      if (!currentConversation?.id) {
        if (!isAbort) {
          setTempMessages(context?.previousTempMessages ?? []);
        }
      } else {
        const conv = currentConversation?.id ?? context?.convKey ?? null;
        if (conv && conv !== "temp") {
          queryClient.invalidateQueries({ queryKey: ["messages", conv] });
        }
      }

      setPendingConversationId(null);
      const map: Map<string, AbortController> = (globalThis as any)
        .__CHAT_CONTROLLERS__;
      if (context?.convKey) map.delete(context.convKey);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || sendMessageMutation.isPending) return;
      sendMessageMutation.mutate(input);
    },
    [input, sendMessageMutation],
  );

  useEffect(() => {
    const handler = () => {
      const map: Map<string, AbortController> = (globalThis as any)
        .__CHAT_CONTROLLERS__;
      if (map) {
        for (const [, ctrl] of map) {
          try {
            ctrl.abort();
          } catch (e) {
            console.log(e);
          }
        }
        map.clear();
      }
      try {
        sendMessageMutation.reset();
      } catch (e) {
        console.log(e);
      }
      setPendingConversationId(null);
      setTempMessages([]);
    };
    window.addEventListener("cancel-active-mutation", handler);
    return () => window.removeEventListener("cancel-active-mutation", handler);
  }, [sendMessageMutation]);

  useEffect(() => {
    const map: Map<string, AbortController> = (globalThis as any)
      .__CHAT_CONTROLLERS__;
    const key = currentConversation?.id ?? "temp";

    return () => {
      // Cleanup when component unmounts or conversation changes
      const ctrl = map?.get(key);
      if (ctrl) {
        try {
          ctrl.abort();
        } catch (e) {
          console.log(e);
        }
        map.delete(key);
      }
    };
  }, [currentConversation?.id]);

  const allMessages = currentConversation?.id ? messages : tempMessages;

  // Inside useChat.ts, before the return statement
  const displayMessages = useMemo(() => {
    if (sendMessageMutation.isPending && allMessages.length > 0) {
      const lastMsg = allMessages[allMessages.length - 1];
      if (lastMsg.role === "user") {
        return [
          ...allMessages,
          {
            id: "loading-placeholder",
            content: "",
            role: "assistant",
            createdAt: new Date().toISOString(),
            source: [],
          } as Message,
        ];
      }
    }
    return allMessages;
  }, [allMessages, sendMessageMutation.isPending]);

  return {
    messages: displayMessages,
    input,
    setInput,
    handleSubmit,
    isSending: sendMessageMutation.isPending,
    isLoadingHistory,
    // cancelSending: sendMessageMutation.reset,
    // pendingConversationId,
    status,
  };
}