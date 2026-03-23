import { google } from "googleapis";
import { Readable } from "stream";

function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function uploadToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth });
  const buffer = Buffer.from(base64Data, "base64");

  const resp = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bufferToStream(buffer),
    },
    fields: "id,webViewLink",
  });

  return {
    fileId: resp.data.id ?? "",
    webViewLink: resp.data.webViewLink ?? "",
  };
}

export async function moveFileToDrive(
  accessToken: string,
  fileId: string,
  newFolderId: string,
  oldFolderId: string
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth });

  await drive.files.update({
    fileId,
    addParents: newFolderId,
    removeParents: oldFolderId,
    fields: "id,parents",
  });
}
