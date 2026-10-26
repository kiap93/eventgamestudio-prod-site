/**
 * Official Invoice PDF Download Utility
 *
 * Securely downloads official tax invoice PDFs using the authenticated apiFetch client.
 * Handles Blob conversion, temporary Object URL creation, filename resolution,
 * cleanup, and user-facing error reporting for expired sessions and access errors.
 */

import { apiFetch } from './api';

export interface DownloadInvoiceOptions {
  /** Optional fallback filename if Content-Disposition is not present */
  fallbackInvoiceNumber?: string;
}

export interface DownloadInvoiceResult {
  success: boolean;
  filename?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Downloads an official invoice PDF via authenticated request.
 *
 * @param invoiceId Unique ID or invoice number of the invoice record
 * @param fallbackInvoiceNumber Optional human-readable invoice number (e.g. INV-2026-00001)
 */
export async function downloadInvoicePdf(
  invoiceId: string,
  fallbackInvoiceNumber?: string
): Promise<DownloadInvoiceResult> {
  if (!invoiceId || typeof invoiceId !== 'string') {
    return {
      success: false,
      error: 'Invoice ID is required to download invoice PDF',
    };
  }

  const cleanInvoiceId = invoiceId.trim();
  if (!cleanInvoiceId) {
    return {
      success: false,
      error: 'Invoice ID cannot be blank',
    };
  }

  try {
    const res = await apiFetch(`/api/invoices/${encodeURIComponent(cleanInvoiceId)}/pdf`, {
      method: 'GET',
    });

    if (!res.ok) {
      let errorMessage = `Failed to download invoice PDF (Status ${res.status})`;

      if (res.status === 401) {
        errorMessage = 'Your login session has expired or is invalid. Please log in again to download the official invoice.';
      } else if (res.status === 403) {
        errorMessage = 'Access denied: You do not have permission to view or download this official tax invoice.';
      } else if (res.status === 404) {
        errorMessage = 'The requested official invoice could not be found.';
      } else {
        try {
          const errData = await res.json();
          if (errData && typeof errData === 'object' && errData.error) {
            errorMessage = String(errData.error);
          }
        } catch {
          // Response body was not JSON; use default status message
        }
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: res.status,
      };
    }

    // Verify response is a PDF
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/pdf')) {
      try {
        const errorJson = await res.json();
        return {
          success: false,
          error: errorJson.error || 'The server did not return a valid PDF document.',
          statusCode: res.status,
        };
      } catch {
        return {
          success: false,
          error: 'The server returned an invalid document format instead of a PDF.',
          statusCode: res.status,
        };
      }
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      return {
        success: false,
        error: 'The generated PDF file was empty. Please retry invoice generation.',
        statusCode: 500,
      };
    }

    // Resolve filename from Content-Disposition or fallback
    let filename = '';
    const contentDisposition = res.headers.get('content-disposition');
    if (contentDisposition) {
      // Handles filename="INV-2026-00001.pdf" or filename=INV-2026-00001.pdf or filename*=UTF-8''...
      const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1].trim());
      }
    }

    if (!filename) {
      const baseName = fallbackInvoiceNumber && fallbackInvoiceNumber.trim()
        ? fallbackInvoiceNumber.trim().replace(/[/\\?%*:|"<>]/g, '_')
        : cleanInvoiceId.replace(/[/\\?%*:|"<>]/g, '_');
      filename = baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
    }

    // Trigger download in browser environment
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Clean up DOM and revoke temporary object URL
      document.body.removeChild(link);
      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore revocation error if window unmounted
        }
      }, 1000);
    }

    return {
      success: true,
      filename,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'An unexpected network error occurred while downloading the invoice PDF.',
    };
  }
}
