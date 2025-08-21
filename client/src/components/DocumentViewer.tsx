import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface DocumentViewerProps {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DocumentViewer({ documentId, open, onOpenChange }: DocumentViewerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/documents", documentId, "view"],
    enabled: !!documentId && open,
  });

  const document = data?.document as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]" aria-describedby="document-viewer-description">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{document?.originalName || "Document Viewer"}</span>
            {document && (
              <Badge variant="outline" className="ml-2">
                {document.status?.charAt(0).toUpperCase() + document.status?.slice(1)}
              </Badge>
            )}
          </DialogTitle>
          <p id="document-viewer-description" className="sr-only">
            PDF document viewer showing the contents of the uploaded document
          </p>
        </DialogHeader>

        <div className="h-[60vh] w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="ml-3 text-gray-600">Loading document...</p>
            </div>
          ) : document ? (
            <div className="h-full w-full">
              <object
                data={`/api/documents/${document.id}/file#toolbar=1&navpanes=1&scrollbar=1`}
                type="application/pdf"
                className="w-full h-full border rounded-lg"
                title={document.originalName}
              >
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <svg className="w-16 h-16 mb-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  <p className="mb-2">PDF viewer not supported in this browser</p>
                  <a 
                    href={`/api/documents/${document.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    Download PDF
                  </a>
                </div>
              </object>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              <p>No document available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}