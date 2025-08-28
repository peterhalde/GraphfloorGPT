import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Send } from "lucide-react";
import ModelSelector from "./ModelSelector";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface MetricsData {
  totalQueries: number;
  avgResponseTime: number;
  successRate: number;
  cacheHitRate: number;
}

interface MessagesResponse {
  messages: Message[];
}

export default function ChatInterface() {
  const [currentMessage, setCurrentMessage] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(() => {
    // Try to restore session from localStorage
    return localStorage.getItem('chatSessionId');
  });
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
      const newSessionId = data.session.id;
      setSessionId(newSessionId);
      // Save session to localStorage
      localStorage.setItem('chatSessionId', newSessionId);
    },
  });

  // Get chat messages
  const { data: messagesResponse } = useQuery<MessagesResponse>({
    queryKey: ["/api/chat/sessions", sessionId, "messages"],
    enabled: !!sessionId,
  });
  
  const messages = messagesResponse?.messages || [];

  // Get GraphRAG metrics
  const { data: metricsData } = useQuery<MetricsData>({
    queryKey: ["/api/graphrag/metrics"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Clear chat mutation
  const clearChatMutation = useMutation({
    mutationFn: async () => {
      // Create a new session
      const response = await apiRequest("POST", "/api/chat/sessions");
      return response.json();
    },
    onSuccess: (data) => {
      const newSessionId = data.session.id;
      setSessionId(newSessionId);
      localStorage.setItem('chatSessionId', newSessionId);
      // Clear the messages cache
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      toast({
        title: "Chat cleared",
        description: "Started a new conversation",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear chat",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
    "Which nodes do you have?",
    "What ingredients are needed for Flammkuchen?",
    "Show me all recipes",
    "List all ingredients",
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
          <Card className="flex flex-col h-[600px]">
            {/* Chat Header */}
            <div className="border-b border-carbon-gray-20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-carbon-blue rounded-full flex items-center justify-center">
                    <i className="fas fa-robot text-white text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">GraphfloorGPT Assistant</h4>
                    <p className="text-sm text-carbon-gray-60">Connected to your knowledge graph</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <ModelSelector />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={messages.length === 0}
                        title="Clear chat history"
                        className="hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear Chat History</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will start a new conversation and clear all messages. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => clearChatMutation.mutate()}>
                          Clear Chat
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4 h-full" ref={scrollRef}>
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
                        <div className="text-sm text-gray-900 whitespace-pre-wrap">{message.content}</div>
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
                  <Send className="h-4 w-4" />
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
                <span className="text-sm font-medium text-gray-900">
                  {metricsData?.totalQueries || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Avg Response Time</span>
                <span className="text-sm font-medium text-gray-900">
                  {metricsData?.avgResponseTime ? `${Math.round(metricsData.avgResponseTime)}ms` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Success Rate</span>
                <span className="text-sm font-medium text-gray-900">
                  {metricsData?.successRate !== undefined ? `${Math.round(metricsData.successRate * 100)}%` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-carbon-gray-60">Cache Hit Rate</span>
                <span className="text-sm font-medium text-gray-900">
                  {metricsData?.cacheHitRate !== undefined ? `${Math.round(metricsData.cacheHitRate * 100)}%` : '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
