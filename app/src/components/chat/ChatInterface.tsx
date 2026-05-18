"use client";

import { useRef, useEffect, useCallback } from "react";
import { useChat, activityRef } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { useModelWarmup } from "@/hooks/useModelWarmup";
import { ChatInput } from "./ChatInput";
import { MessageBubble } from "./MessageBubble";
import { ConversationSidebar } from "./ConversationSidebar";
import { ChatInterfaceProps } from "@/types/user";
import { toast } from "react-toastify";
import { Conversation } from "@/types/chat";
import { useComp } from "@/stores/compStore";
import { ComputerDesktopIcon } from "@heroicons/react/24/outline";

export function ChatInterface({ user }: ChatInterfaceProps) {

  const { modelStatus, recordActivity } = useModelWarmup();
  activityRef.current = recordActivity;

  
  const isGuest = !user?.id;
  const userId = user?.id ?? null;

  const setSidebarOpen = useComp((state) => state.setSidebarOpen);
  const sidebarOpen = useComp((state) => state.sidebarOpen);

  const {
    conversations,
    currentConversation,
    selectConversation,
    createNewConversation,
    deleteConversation,
    isDeletingConversation,
    conversationDeleteError,
    responseMsg,
    isLoadingConversations,
    clearResponseMessages,
  } = useConversations(userId);

  const handleNewConversationCreated = useCallback(
    (newId: string) => {
      selectConversation({ id: newId } as Conversation);
    },
    [selectConversation],
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      selectConversation(conv);
      if (sidebarOpen) setSidebarOpen(false);
    },
    [selectConversation, sidebarOpen, setSidebarOpen],
  );

  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isSending,
    isLoadingHistory,
    status,
  } = useChat({
    currentConversation,
    userId,
    onNewConversationCreated: handleNewConversationCreated,
  });


  // const modelStatus = useModelWarmup();

  const isLoading = isSending || isLoadingHistory;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (responseMsg) {
      toast(responseMsg);
      clearResponseMessages();
    }
    if (conversationDeleteError) {
      toast(conversationDeleteError);
      clearResponseMessages();
    }
  }, [responseMsg, conversationDeleteError, clearResponseMessages]);

  const lastMessage = messages[messages.length - 1];
  const showLoadingBubble =
    isSending &&
    (lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && lastMessage?.content === ""));
  // console.log('showloadigbubble: ', showLoadingBubble)

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 relative overflow-hidden md:overflow-visible">
      <div
        className={`
        fixed inset-y-0 left-0 z-20 w-80 bg-blue-50 border-r border-gray-200 
        flex-col shrink-0 transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full shadow-none"}
        lg:static lg:flex lg:translate-x-0 
      `}
      >
        <ConversationSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={handleSelectConversation}
          onCreateNewConversation={createNewConversation}
          onDeleteConversation={deleteConversation}
          isDeletingConversation={isDeletingConversation}
          isLoadingConversations={isLoadingConversations}
          setInput={setInput}
        />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black opacity-30 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 flex flex-col relative max-w-2xl mx-auto border-gray-150 border-r border-l shadow shadow-gray-300">
        {/* model readiness indicator */}
        {modelStatus !== "ready" && messages.length === 0 && (
          <div
            className={`
            px-4 py-2 text-center text-xs border-b
            ${
              modelStatus === "warming"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : modelStatus === "error"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-blue-50 text-gray-500 border-gray-200"
            }
          `}
          >
            {modelStatus === "warming"
              ? "Preparing AI models... first response may take a moment"
              : modelStatus === "error"
                ? "AI service unavailable. Please refresh."
                : "Checking AI status..."}
          </div>
        )}

        {isGuest && messages.length === 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
            <p className="text-sm text-amber-800">
              You are using MediFact as a guest.{" "}
              <a
                href="/register"
                className="font-semibold underline hover:text-amber-900"
              >
                Create an account
              </a>{" "}
              to save your chat history.
            </p>
          </div>
        )}

        <div className="flex-1 p-4 overflow-auto space-y-4 scrollbar-thin">
          {messages.length === 0 && !isLoadingHistory && !isSending && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <h3 className="text-lg font-medium">Welcome to MediFact</h3>
                <p className="mt-2">
                  Ask a health-related question to get started.
                </p>
                {isGuest && (
                  <p className="mt-1 text-sm text-gray-400">
                    Your chat will not be saved.
                  </p>
                )}
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <h3 className="text-lg font-medium">Loading chat history...</h3>
                <div className="mt-4 flex justify-center space-x-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <div
                    className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isPlaceholder =
              message.role === "assistant" &&
              message.content === "" &&
              isSending;
            if (isPlaceholder) return null;

            return <MessageBubble key={message.id} message={message} />;
          })}

          {showLoadingBubble && (
            <div className="flex justify-start items-start space-x-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shrink-0">
                <ComputerDesktopIcon className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col">
                <div className="bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-200 min-w-[220px]">
                  <div className="flex items-center space-x-2">
                    {!status ? (
                      <>
                        <span className="text-xs text-gray-500 animate-pulse">
                          Retrieving documents
                        </span>
                        <div
                          className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                          style={{ animationDelay: "0s" }}
                        />
                        <div
                          className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        />
                        <div
                          className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                          style={{ animationDelay: "0.4s" }}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-gray-500 animate-pulse">
                        {status.replace(/_/g, " ")}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
