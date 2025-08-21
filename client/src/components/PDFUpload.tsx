import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatFileSize, formatRelativeTime } from "@/lib/utils";
import DocumentViewer from "./DocumentViewer";

export default function PDFUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);

  const { data: documentResponse, isLoading } = useQuery({
    queryKey: ["/api/documents"],
    refetchInterval: (query) => {
      // Poll every 3 seconds if any document is processing
      const docs = query.state.data?.documents || [];
      const hasProcessing = docs.some((doc: any) => doc.status === "processing");
      return hasProcessing ? 3000 : false; // 3 seconds if processing, no polling otherwise
    },
  });
  
  const documents = (documentResponse as any)?.documents || [];

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      formData.append("file", files[0]);
      
      const response = await apiRequest("POST", "/api/documents/upload", formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: "PDF uploaded and processing started",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest("DELETE", `/api/documents/${documentId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "Document and related data removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest("POST", `/api/documents/${documentId}/reprocess`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing restarted",
        description: "Document processing has been restarted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error) => {
      toast({
        title: "Retry failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        uploadMutation.mutate(acceptedFiles);
      }
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed":
        return "bg-green-100 text-green-800 border border-green-200";
      case "processing":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      case "failed":
        return "bg-red-100 text-red-800 border border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };



  return (
    <div className="max-w-4xl mx-auto">
      {/* Step Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-carbon-blue text-white rounded-full flex items-center justify-center text-sm font-medium">1</div>
            <span className="ml-3 text-sm font-medium text-gray-900">Upload PDF</span>
          </div>
          <div className="flex-1 mx-4 h-px bg-carbon-gray-20"></div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-carbon-gray-20 text-carbon-gray-60 rounded-full flex items-center justify-center text-sm font-medium">2</div>
            <span className="ml-3 text-sm font-medium text-carbon-gray-60">Extract Text</span>
          </div>
          <div className="flex-1 mx-4 h-px bg-carbon-gray-20"></div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-carbon-gray-20 text-carbon-gray-60 rounded-full flex items-center justify-center text-sm font-medium">3</div>
            <span className="ml-3 text-sm font-medium text-carbon-gray-60">Generate Nodes</span>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <Card className="mb-8">
        <CardContent className="p-8">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-carbon-blue bg-blue-50"
                : "border-carbon-gray-30 hover:border-carbon-blue"
            }`}
          >
            <input {...getInputProps()} />
            <div className="max-w-md mx-auto">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Upload PDF Documents</h3>
              <p className="text-carbon-gray-60 mb-6">
                {isDragActive
                  ? "Drop your PDF file here"
                  : "Drag and drop your PDF files here, or click to browse"}
              </p>
              <Button disabled={uploadMutation.isPending}>
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {uploadMutation.isPending ? "Uploading..." : "Choose Files"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recently Uploaded Files */}
      <Card>
        <div className="border-b border-carbon-gray-20 p-4">
          <h3 className="text-lg font-medium text-gray-900">Recent Uploads</h3>
        </div>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="p-8 text-center text-carbon-gray-60">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-carbon-gray-20">
              {documents.map((document: any) => (
                <div key={document.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{document.originalName}</p>
                      <p className="text-sm text-carbon-gray-60">
                        {formatFileSize(document.fileSize)} • 
                        {document.uploadedAt ? formatRelativeTime(new Date(document.uploadedAt)) : "Just now"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {document.status === "processing" ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                        </div>
                        <span className="text-xs font-medium text-blue-600">Processing...</span>
                      </div>
                    ) : (
                      <div className={`px-3 py-1 rounded-md text-xs font-medium ${getStatusColor(document.status)}`}>
                        {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                      </div>
                    )}
                    {(document.status === "failed" || document.status === "processed") && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => retryMutation.mutate(document.id)}
                        disabled={retryMutation.isPending}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                        {document.status === "failed" ? "Retry" : "Reprocess"}
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setViewingDocumentId(document.id)}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="hover:text-red-600"
                      onClick={() => deleteMutation.mutate(document.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentViewer 
        documentId={viewingDocumentId}
        open={!!viewingDocumentId}
        onOpenChange={(open) => !open && setViewingDocumentId(null)}
      />
    </div>
  );
}
