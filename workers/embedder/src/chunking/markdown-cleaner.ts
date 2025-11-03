import { marked } from 'marked';

/**
 * Clean and normalize Markdown for chunking
 */
export class MarkdownCleaner {
  /**
   * Strip Markdown formatting but preserve structure
   */
  clean(markdown: string): string {
    // Remove code blocks
    markdown = markdown.replace(/```[\s\S]*?```/g, '[code block]');

    // Remove inline code
    markdown = markdown.replace(/`[^`]+`/g, '[code]');

    // Remove images
    markdown = markdown.replace(/!\[.*?\]\(.*?\)/g, '[image]');

    // Convert links to text
    markdown = markdown.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Remove extra whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }

  /**
   * Extract plain text from Markdown
   */
  toPlainText(markdown: string): string {
    // Use marked to parse then extract text
    const html = marked.parse(markdown) as string;

    // Strip HTML tags
    const text = html.replace(/<[^>]+>/g, ' ');

    // Normalize whitespace
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Check if text is mostly code
   */
  isCode(text: string): boolean {
    const codeIndicators = [
      /```/g,
      /^    /gm,  // Indented code blocks
      /function\s+\w+\s*\(/,
      /class\s+\w+/,
      /const\s+\w+\s*=/
    ];

    let matches = 0;
    for (const pattern of codeIndicators) {
      if (pattern.test(text)) matches++;
    }

    return matches >= 2;
  }
}
