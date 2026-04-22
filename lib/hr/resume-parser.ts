import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParsedResume {
  text: string;
  metadata: {
    fileType: string;
    pages?: number;
    wordCount: number;
  };
}

/**
 * Parse PDF file buffer and extract text content
 */
export async function parsePDF(buffer: Buffer): Promise<ParsedResume> {
  try {
    const data = await pdf(buffer);
    const text = data.text.trim();
    
    return {
      text,
      metadata: {
        fileType: 'pdf',
        pages: data.numpages,
        wordCount: text.split(/\s+/).filter(Boolean).length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse DOCX file buffer and extract text content
 */
export async function parseDOCX(buffer: Buffer): Promise<ParsedResume> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    
    return {
      text,
      metadata: {
        fileType: 'docx',
        wordCount: text.split(/\s+/).filter(Boolean).length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse resume file based on content type
 */
export async function parseResume(
  buffer: Buffer,
  contentType: string
): Promise<ParsedResume> {
  if (contentType === 'application/pdf') {
    return parsePDF(buffer);
  }
  
  if (
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    contentType === 'application/msword'
  ) {
    return parseDOCX(buffer);
  }
  
  throw new Error(`Unsupported file type: ${contentType}. Supported types: PDF, DOCX`);
}

/**
 * Extract text from a file URL
 */
export async function parseResumeFromUrl(url: string): Promise<ParsedResume> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch resume: ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  
  // Determine type from URL if content-type is generic
  if (contentType.includes('octet-stream') || !contentType) {
    if (url.toLowerCase().endsWith('.pdf')) {
      return parsePDF(buffer);
    }
    if (url.toLowerCase().endsWith('.docx') || url.toLowerCase().endsWith('.doc')) {
      return parseDOCX(buffer);
    }
  }
  
  return parseResume(buffer, contentType);
}
