import Anthropic from "@anthropic-ai/sdk";
import { InvoiceData } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function extractInvoiceData(
  base64Data: string,
  mimeType: string,
  fileName: string
): Promise<InvoiceData> {
  const isImage = mimeType.startsWith("image/");
  
  let content: Anthropic.MessageParam["content"];

  if (isImage) {
    content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64Data,
        },
      },
      {
        type: "text",
        text: EXTRACTION_PROMPT,
      },
    ];
  } else {
    // PDF - use document type
    content = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data,
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        type: "text",
        text: EXTRACTION_PROMPT,
      },
    ];
  }

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return parseExtractionResponse(text, fileName);
}

const EXTRACTION_PROMPT = `You are extracting invoice data for an accounts payable system at Anchor Investments, a commercial real estate company.

Extract the following fields from this invoice:
1. vendor - The company or person who issued the invoice (business name)
2. invoiceNumber - The invoice number or reference number
3. amount - The total amount due (include currency symbol, e.g. "$1,234.56")
4. property - The property name or address this invoice is for (look for property name, site name, or address)
5. dueDate - The payment due date (format as MM/DD/YYYY if possible)

Respond ONLY with a JSON object in this exact format:
{
  "vendor": "...",
  "invoiceNumber": "...",
  "amount": "...",
  "property": "...",
  "dueDate": "...",
  "confidence": "high|medium|low",
  "notes": "any issues or ambiguities"
}

If a field cannot be determined, use "UNKNOWN" as the value.
Set confidence to:
- "high" if all fields are clearly visible and unambiguous
- "medium" if most fields found but some uncertain
- "low" if significant data is missing or unclear`;

function parseExtractionResponse(text: string, fileName: string): InvoiceData {
  try {
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      vendor: sanitizeField(parsed.vendor ?? "UNKNOWN"),
      invoiceNumber: sanitizeField(parsed.invoiceNumber ?? "UNKNOWN"),
      amount: sanitizeField(parsed.amount ?? "UNKNOWN"),
      property: sanitizeField(parsed.property ?? "UNKNOWN"),
      dueDate: sanitizeField(parsed.dueDate ?? "UNKNOWN"),
      confidence: parsed.confidence ?? "low",
      notes: parsed.notes,
    };
  } catch (err) {
    return {
      vendor: "UNKNOWN",
      invoiceNumber: "UNKNOWN",
      amount: "UNKNOWN",
      property: "UNKNOWN",
      dueDate: "UNKNOWN",
      confidence: "low",
      notes: `Extraction parsing failed: ${err instanceof Error ? err.message : "unknown error"}. File: ${fileName}`,
    };
  }
}

function sanitizeField(value: string): string {
  // Remove characters that are unsafe in filenames
  return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "UNKNOWN";
}

export function buildFileName(data: InvoiceData, originalExt: string): string {
  const vendor = slugify(data.vendor);
  const invoiceNum = slugify(data.invoiceNumber);
  const property = slugify(data.property);
  const amount = data.amount.replace(/[^0-9.]/g, "");
  const ext = originalExt.startsWith(".") ? originalExt : `.${originalExt}`;
  
  return `${vendor}_${invoiceNum}_${property}_${amount}${ext}`;
}

function slugify(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 40);
}
