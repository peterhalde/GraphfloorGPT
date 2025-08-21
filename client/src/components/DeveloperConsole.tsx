import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatRelativeTime } from "@/lib/utils";

interface QueryTranslation {
  id: string;
  naturalLanguageQuery: string;
  graphQuery: string;
  queryType: string;
  executionTime?: number;
  resultCount?: number;
  status: string;
  errorMessage?: string;
  approved: boolean;
  createdAt: string;
}

export default function DeveloperConsole() {
  const [manualQuery, setManualQuery] = useState("");
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch query translations
  const { data: translationsResponse, isLoading: translationsLoading } = useQuery({
    queryKey: ["/api/dev/query-translations"],
  });
  
  const translations = translationsResponse?.translations || [];

  // Approve/reject translation mutation
  const approveTranslationMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const response = await apiRequest("PATCH", `/api/dev/query-translations/${id}/approve`, { approved });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dev/query-translations"] });
      toast({
        title: "Translation updated",
        description: "Query translation approval status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Execute manual query mutation
  const executeQueryMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("POST", "/api/dev/execute-query", { query });
      return response.json();
    },
    onSuccess: (data) => {
      setQueryResults(data.results || []);
      setQueryError(null);
      toast({
        title: "Query executed",
        description: `Query executed successfully. Found ${data.results?.length || 0} results.`,
      });
    },
    onError: (error) => {
      setQueryResults([]);
      setQueryError(error.message);
      toast({
        title: "Query failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExecuteQuery = () => {
    if (!manualQuery.trim()) {
      toast({
        title: "Query required",
        description: "Please enter a query to execute",
        variant: "destructive",
      });
      return;
    }
    executeQueryMutation.mutate(manualQuery);
  };

  const handleValidateQuery = () => {
    // Basic validation - check if it starts with common Cypher keywords
    const cypherKeywords = ['MATCH', 'CREATE', 'MERGE', 'DELETE', 'SET', 'RETURN', 'WHERE'];
    const queryUpper = manualQuery.trim().toUpperCase();
    
    if (!cypherKeywords.some(keyword => queryUpper.startsWith(keyword))) {
      toast({
        title: "Query validation",
        description: "Query should start with a valid Cypher keyword (MATCH, CREATE, etc.)",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Query validation",
        description: "Query syntax appears valid",
      });
    }
  };

  const handleSaveQuery = () => {
    // Save to localStorage for now
    const savedQueries = JSON.parse(localStorage.getItem('savedQueries') || '[]');
    const newQuery = {
      id: Date.now().toString(),
      query: manualQuery,
      timestamp: new Date().toISOString()
    };
    savedQueries.push(newQuery);
    localStorage.setItem('savedQueries', JSON.stringify(savedQueries));
    
    toast({
      title: "Query saved",
      description: "Query has been saved to your local collection",
    });
  };

  const getStatusBadge = (translation: QueryTranslation) => {
    if (translation.status === "success") {
      return translation.approved ? (
        <Badge className="bg-carbon-green bg-opacity-10 text-carbon-green">
          <i className="fas fa-thumbs-up mr-1"></i>
          Approved
        </Badge>
      ) : (
        <Badge className="bg-carbon-green bg-opacity-10 text-carbon-green">
          <i className="fas fa-check mr-1"></i>
          Success
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-carbon-red bg-opacity-10 text-carbon-red">
          <i className="fas fa-times mr-1"></i>
          Failed
        </Badge>
      );
    }
  };

  // Mock training data stats
  const trainingStats = {
    totalExamples: 247,
    approvedTranslations: translations.filter((t: QueryTranslation) => t.approved).length,
    pendingReview: translations.filter((t: QueryTranslation) => t.status === "success" && !t.approved).length
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900">Developer Console</h3>
        <p className="text-carbon-gray-60">Monitor query translations and improve the natural language processing</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query Translation Log */}
        <div className="space-y-6">
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Recent Query Translations</h4>
            </div>
            <CardContent className="p-4">
              {translationsLoading ? (
                <div className="text-center py-8 text-carbon-gray-60">
                  <i className="fas fa-sync fa-spin text-2xl mb-4"></i>
                  <p>Loading translations...</p>
                </div>
              ) : translations.length === 0 ? (
                <div className="text-center py-8 text-carbon-gray-60">
                  <i className="fas fa-code text-4xl mb-4"></i>
                  <p>No query translations yet</p>
                  <p className="text-sm mt-2">Start chatting to see query translations here</p>
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {translations.map((translation: QueryTranslation) => (
                      <div key={translation.id} className="border border-carbon-gray-20 rounded-lg p-4">
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900">Natural Language Query:</span>
                            {getStatusBadge(translation)}
                          </div>
                          <p className="text-sm text-carbon-gray-60 bg-carbon-gray-10 p-2 rounded">
                            "{translation.naturalLanguageQuery}"
                          </p>
                        </div>
                        
                        {translation.status === "success" ? (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-gray-900 mb-2">Generated Graph Query:</p>
                            <pre className="text-xs font-ibm-mono bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
                              {translation.graphQuery || "No query generated"}
                            </pre>
                          </div>
                        ) : (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-gray-900 mb-2">Error:</p>
                            <pre className="text-xs font-ibm-mono bg-red-50 text-red-700 p-3 rounded">
                              {translation.errorMessage || "Unknown error occurred"}
                            </pre>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between text-xs text-carbon-gray-60 mb-3">
                          <span>Executed: {formatRelativeTime(new Date(translation.createdAt))}</span>
                          {translation.executionTime && (
                            <span>Response time: {translation.executionTime}ms</span>
                          )}
                        </div>
                        
                        {translation.status === "success" && (
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              className="bg-carbon-green text-white hover:bg-green-600"
                              onClick={() => approveTranslationMutation.mutate({ id: translation.id, approved: true })}
                              disabled={approveTranslationMutation.isPending || translation.approved}
                            >
                              <i className="fas fa-thumbs-up mr-1"></i>
                              {translation.approved ? "Approved" : "Approve"}
                            </Button>
                            {!translation.approved && (
                              <Button
                                size="sm"
                                className="bg-carbon-yellow text-white hover:bg-yellow-600"
                                onClick={() => {
                                  // For suggest improvement, we could open a modal or form
                                  toast({
                                    title: "Feature coming soon",
                                    description: "Suggestion interface will be available in a future update",
                                  });
                                }}
                              >
                                <i className="fas fa-edit mr-1"></i>
                                Suggest Improvement
                              </Button>
                            )}
                          </div>
                        )}

                        {translation.status === "failed" && (
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                toast({
                                  title: "Feature coming soon",
                                  description: "Training example interface will be available in a future update",
                                });
                              }}
                            >
                              <i className="fas fa-plus mr-1"></i>
                              Add Training Example
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Query Builder & Testing */}
        <div className="space-y-6">
          {/* Manual Query Builder */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Manual Query Builder</h4>
            </div>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Graph Query (Cypher)
                  </label>
                  <Textarea
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="MATCH (n:Node) RETURN n"
                    className="h-32 font-ibm-mono text-sm"
                  />
                </div>
                <div className="flex space-x-3">
                  <Button
                    onClick={handleExecuteQuery}
                    disabled={executeQueryMutation.isPending}
                    className="text-sm"
                  >
                    <i className="fas fa-play mr-2"></i>
                    {executeQueryMutation.isPending ? "Executing..." : "Execute Query"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleValidateQuery}
                    className="text-sm"
                  >
                    <i className="fas fa-check mr-2"></i>
                    Validate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSaveQuery}
                    disabled={!manualQuery.trim()}
                    className="text-sm"
                  >
                    <i className="fas fa-save mr-2"></i>
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Query Results */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Query Results</h4>
            </div>
            <CardContent className="p-4">
              <div className="bg-carbon-gray-10 rounded-lg p-4 h-48 overflow-auto">
                {executeQueryMutation.isPending ? (
                  <div className="flex items-center justify-center h-full text-carbon-gray-60">
                    <i className="fas fa-sync fa-spin mr-2"></i>
                    <span>Executing query...</span>
                  </div>
                ) : queryError ? (
                  <pre className="text-sm font-ibm-mono text-red-600 whitespace-pre-wrap">
                    Error: {queryError}
                  </pre>
                ) : queryResults.length > 0 ? (
                  <pre className="text-sm font-ibm-mono text-gray-800 whitespace-pre-wrap">
                    {JSON.stringify(queryResults, null, 2)}
                  </pre>
                ) : (
                  <pre className="text-sm font-ibm-mono text-carbon-gray-60">
                    Query not executed yet.{"\n"}Run a query to see results here.
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Training Data Management */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Training Data</h4>
            </div>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-carbon-gray-60">Training Examples</span>
                  <span className="text-sm font-medium text-gray-900">{trainingStats.totalExamples}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-carbon-gray-60">Approved Translations</span>
                  <span className="text-sm font-medium text-gray-900">{trainingStats.approvedTranslations}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-carbon-gray-60">Pending Review</span>
                  <span className="text-sm font-medium text-gray-900">{trainingStats.pendingReview}</span>
                </div>
                <div className="pt-3 border-t border-carbon-gray-20">
                  <Button
                    className="w-full text-sm"
                    onClick={() => {
                      toast({
                        title: "Feature coming soon",
                        description: "Model retraining will be available in a future update",
                      });
                    }}
                  >
                    <i className="fas fa-sync mr-2"></i>
                    Retrain Translation Model
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
