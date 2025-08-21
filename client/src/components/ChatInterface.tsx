import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function ChatInterface() {
  const [currentMessage, setCurrentMessage] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create or get chat session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/chat/sessions");
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session.id);
    },
  });

  // Get chat messages
  const { data: messagesResponse } = useQuery({
    queryKey: ["/api/chat/sessions", sessionId, "messages"],
    enabled: !!sessionId,
  });
  
  const messages = messagesResponse?.messages || [];

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!sessionId) throw new Error("No session");
      const response = await apiRequest("POST", `/api/chat/sessions/${sessionId}/messages`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", sessionId, "messages"] });
      setCurrentMessage("");
    },
    onError: (error) => {
      toast({
        title: "Message failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Initialize session on mount
  useEffect(() => {
    if (!sessionId) {
      createSessionMutation.mutate();
    }
  }, [sessionId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;
    sendMessageMutation.mutate(currentMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickQueries = [
    "Show all manufacturing nodes",
    "Find quality control relations",
    "List all equipment types",
    "Show production dependencies",
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900">Natural Language Query Interface</h3>
        <p className="text-carbon-gray-60">Ask questions about your knowledge graph using natural language</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-96">
            {/* Chat Header */}
            <div className="border-b border-carbon-gray-20 p-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-carbon-blue rounded-full flex items-center justify-center">
                  <i className="fas fa-robot text-white text-sm"></i>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">GraphfloorGPT Assistant</h4>
                  <p className="text-sm text-carbon-gray-60">Connected to your knowledge graph</p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-carbon-blue rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-robot text-white text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        Hello! I can help you query your knowledge graph. You can ask me questions like "What quality control processes are required for manufacturing equipment?" or "Show me all nodes related to production lines."
                      </p>
                      <p className="text-xs text-carbon-gray-60 mt-1">Just now</p>
                    </div>
                  </div>
                )}

                {messages.map((message: Message) => (
                  <div key={message.id} className={`flex items-start space-x-3 ${message.role === "user" ? "justify-end" : ""}`}>
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 bg-carbon-blue rounded-full flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-robot text-white text-sm"></i>
                      </div>
                    )}
                    <div className={`flex-1 ${message.role === "user" ? "text-right" : ""}`}>
                      {message.role === "user" ? (
                        <div className="inline-block bg-carbon-blue text-white rounded-lg px-4 py-2 max-w-md">
                          <p className="text-sm">{message.content}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900">{message.content}</p>
                      )}
                      <p className="text-xs text-carbon-gray-60 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    {message.role === "user" && (
                      <div className="w-8 h-8 bg-carbon-gray-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-user text-carbon-gray-60 text-sm"></i>
                      </div>
                    )}
                  </div>
                ))}

                {sendMessageMutation.isPending && (
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-carbon-blue rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-robot text-white text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">Thinking...</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <div className="border-t border-carbon-gray-20 p-4">
              <div className="flex space-x-3">
                <Input
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about your knowledge graph..."
                  disabled={sendMessageMutation.isPending || !sessionId}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending || !sessionId || !currentMessage.trim()}
                >
                  <i className="fas fa-paper-plane"></i>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Query Translation Panel */}
        <div className="space-y-6">
          {/* Quick Queries */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Quick Queries</h4>
            </div>
            <CardContent className="p-4 space-y-2">
              {quickQueries.map((query) => (
                <Button
                  key={query}
                  variant="ghost"
                  size="sm"
                  className="w-full text-left justify-start text-carbon-blue hover:bg-blue-50"
                  onClick={() => setCurrentMessage(query)}
                >
                  {query}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Query Statistics */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Query Statistics</h4>
            </div>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Total Queries</span>
                <span className="text-sm font-medium text-gray-900">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Avg Response Time</span>
                <span className="text-sm font-medium text-gray-900">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Success Rate</span>
                <span className="text-sm font-medium text-gray-900">-</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
