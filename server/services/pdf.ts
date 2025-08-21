import { readFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class PDFService {
  async extractText(filePath: string): Promise<string> {
    try {
      console.log(`=== REAL PDF EXTRACTION ===`);
      console.log(`Extracting text from: ${filePath}`);
      
      // Try using pdftotext (poppler-utils) which should be available in most environments
      try {
        const { stdout, stderr } = await execAsync(`pdftotext "${filePath}" -`);
        
        if (stderr && stderr.trim()) {
          console.log(`pdftotext warnings: ${stderr}`);
        }
        
        if (stdout && stdout.trim().length > 10) {
          console.log(`Successfully extracted ${stdout.length} characters using pdftotext`);
          console.log(`Text preview: ${stdout.substring(0, 300)}...`);
          console.log(`=== END REAL PDF EXTRACTION ===`);
          return stdout.trim();
        }
      } catch (pdfTextError) {
        console.log(`pdftotext failed: ${pdfTextError.message}`);
      }

      // Fallback: Try using strings command to extract any readable text
      try {
        const { stdout } = await execAsync(`strings "${filePath}" | head -100`);
        if (stdout && stdout.trim().length > 10) {
          console.log(`Extracted ${stdout.length} characters using strings command`);
          console.log(`Text preview: ${stdout.substring(0, 300)}...`);
          return stdout.trim();
        }
      } catch (stringsError) {
        console.log(`strings command failed: ${stringsError.message}`);
      }

      // If all extraction methods fail, return a clear error message
      const fileName = filePath.split('/').pop() || 'unknown';
      const errorText = `Unable to extract text from PDF: ${fileName}
      
This PDF file could not be processed by the available text extraction tools.
The file may be:
- Image-based (scanned) without text layer
- Encrypted or password protected  
- Corrupted or in an unsupported format

To fix this, please try:
1. Re-saving the PDF with text layer enabled
2. Using a different PDF file
3. Converting to a text-based PDF format`;

      console.log(`PDF extraction failed, returning error message`);
      console.log(`=== END PDF EXTRACTION ===`);
      return errorText;
      
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      throw new Error("Failed to extract text from PDF");
    }
  }

  async extractMetadata(filePath: string): Promise<{
    pages: number;
    title?: string;
    author?: string;
    creator?: string;
    creationDate?: Date;
  }> {
    try {
      const fileName = filePath.split('/').pop() || 'unknown';
      return {
        pages: 1,
        title: `DEBUG - ${fileName}`,
        author: "PDF Extraction Debug",
        creator: "GraphfloorGPT Temp",
        creationDate: new Date(),
      };
    } catch (error) {
      console.error("Error extracting PDF metadata:", error);
      throw new Error("Failed to extract metadata from PDF");
    }
  }
}

export const pdfService = new PDFService();
