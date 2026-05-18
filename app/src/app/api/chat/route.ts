import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateConversationTitle } from "@/lib/utils";
import { rateLimitService } from "@/lib/rateLimiter";
import { headers } from "next/headers";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL;
const RAG_SERVICE_API_KEY = process.env.RAG_SERVICE_API_KEY;

const getClientIp = async (): Promise<string> => {
  const headersList = await headers();
  const ipHeader = headersList.get("x-forwarded-for");
  return ipHeader ? ipHeader.split(",")[0].trim() : "127.0.0.1";
};

export async function POST(request: NextRequest) {
  if (!RAG_SERVICE_URL) {
    return sseError("rag service url not configured", 500);
  }

  try {
    const session = await auth();
    const ip = await getClientIp();
    const userId = session?.user?.id ?? null;

    const limitStatus = await rateLimitService.acquireLock(
      ip,
      userId ?? undefined,
    );
    if (!limitStatus.allowed) {
      console.log("Rate limit exceeded")
      return sseError("Rate limit exceeded", 429);
    }

    const body = await request.json();
    const { message, conversationId, history } = body;
    if (!message?.trim()) {
      return sseError("Message is required", 400);
    }

    let conversation: { id: string } | null = null;
    if (userId) {
      if (conversationId) {
        const existing = await prisma.conversation.findFirst({
          where: { id: conversationId, userId },
        });
        if (!existing) return sseError("Conversation not found", 404);
        conversation = existing;
      } else {
        conversation = await prisma.conversation.create({
          data: { title: generateConversationTitle(message), userId },
        });
      }
      await prisma.message.create({
        data: {
          role: "user",
          content: message,
          conversationId: conversation?.id,
          source: "",
        },
      });
    }

    const ragResponse = await fetch(RAG_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(RAG_SERVICE_API_KEY && {
          Authorization: `Bearer ${RAG_SERVICE_API_KEY}`,
        }),
      },
      body: JSON.stringify({
        query: message,
        history: history || [],
        stream: true,
      }),
    });

    if (!ragResponse.ok || !ragResponse.body) {
      console.log("rag service error", ragResponse.statusText);
      return sseError("rag service error", 502);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    let sources: any[] = [];

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        buffer += text;

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          console.log("event from route: ", event)
          const lines = event.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (eventType === "token") assistantText += payload.text || "";
              else if (eventType === "meta") sources = payload.sources || [];
            } catch {}
          }
        }

        controller.enqueue(chunk);
      },

      async flush(controller) {
        if (buffer) {
          
          const lines = buffer.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (eventType === "token") assistantText += payload.text || "";
              else if (eventType === "meta") sources = payload.sources || [];
            } catch {}
          }
        }

        if (userId && conversation) {
          try {
            await prisma.message.create({
              data: {
                role: "assistant",
                content: assistantText,
                conversationId: conversation.id,
                source: JSON.stringify(sources),
              },
            });
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { updatedAt: new Date() },
            });
          } catch (dbErr) {
            console.error("DB save failed:", dbErr);
          }
        }

        if (conversation?.id){
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({conversationId: conversation.id})}`
            )
          )
        }

        controller.terminate();
      },
    });

    const output = ragResponse.body.pipeThrough(transformStream);

    return new Response(output, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
    
  } catch (error) {
    console.error("chat api error:", error);
    return sseError("internal server error", 500);
  }
}

function sseError(message: string, status: number): Response {
  return new Response(
    `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
    { status, headers: { "Content-Type": "text/event-stream" } },
  );
}