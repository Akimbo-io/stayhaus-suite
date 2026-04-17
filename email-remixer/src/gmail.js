import { google } from 'googleapis';

/**
 * Recursively walks MIME parts to find the text/html part and decode it.
 * Returns the decoded HTML string, or null if not found.
 *
 * @param {object} payload - Gmail message payload (or nested part)
 * @returns {string|null}
 */
export function extractHtmlBody(payload) {
  if (!payload) return null;

  // Direct text/html part
  if (payload.mimeType === 'text/html') {
    const data = payload.body?.data;
    if (!data) return null;
    return Buffer.from(data, 'base64url').toString('utf8');
  }

  // Recurse into sub-parts for multipart/* types
  const parts = payload.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    for (const part of parts) {
      const result = extractHtmlBody(part);
      if (result !== null) return result;
    }
  }

  return null;
}

/**
 * Walks MIME parts to collect inline image attachments (CID-referenced).
 * Returns an array of { contentId, mimeType, attachmentId, filename } objects.
 *
 * @param {object} payload - Gmail message payload (or nested part)
 * @returns {Array<{contentId: string, mimeType: string, attachmentId: string, filename: string}>}
 */
export function extractInlineImages(payload) {
  if (!payload) return [];

  const results = [];

  const isImagePart =
    payload.mimeType?.startsWith('image/') &&
    payload.body?.attachmentId;

  if (isImagePart) {
    const headers = payload.headers ?? [];
    const contentIdHeader = headers.find(
      (h) => h.name.toLowerCase() === 'content-id'
    );
    const contentId = contentIdHeader
      ? contentIdHeader.value.replace(/[<>]/g, '')
      : null;

    results.push({
      contentId,
      mimeType: payload.mimeType,
      attachmentId: payload.body.attachmentId,
      filename: payload.filename ?? null,
    });
  }

  const parts = payload.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      results.push(...extractInlineImages(part));
    }
  }

  return results;
}

/**
 * Fetches the raw attachment data for a given message and attachment ID.
 *
 * @param {object} auth - Authorized Google OAuth2 client
 * @param {string} messageId - Gmail message ID
 * @param {string} attachmentId - Gmail attachment ID
 * @returns {Promise<Buffer>} - Raw attachment bytes
 */
export async function getAttachment(auth, messageId, attachmentId) {
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  const data = response.data.data;
  return Buffer.from(data, 'base64url');
}

/**
 * Lists messages from a given sender and fetches their full payloads.
 *
 * @param {object} auth - Authorized Google OAuth2 client
 * @param {string} senderEmail - Email address to filter by
 * @param {number} [maxResults=10] - Maximum number of messages to return
 * @returns {Promise<Array<object>>} - Array of full Gmail message objects
 */
export async function fetchEmailsFromSender(auth, senderEmail, maxResults = 10) {
  return fetchEmailsByQuery(auth, `from:${senderEmail}`, maxResults);
}

/**
 * Lists messages matching a raw Gmail query and fetches their full payloads.
 *
 * @param {object} auth - Authorized Google OAuth2 client
 * @param {string} query - Gmail search query (e.g. "category:promotions")
 * @param {number} [maxResults=10] - Maximum number of messages to return
 * @returns {Promise<Array<object>>} - Array of full Gmail message objects
 */
export async function fetchEmailsByQuery(auth, query, maxResults = 10) {
  const gmail = google.gmail({ version: 'v1', auth });

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messages = listResponse.data.messages ?? [];

  const fullMessages = await Promise.all(
    messages.map((msg) =>
      gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      }).then((res) => res.data)
    )
  );

  return fullMessages;
}
