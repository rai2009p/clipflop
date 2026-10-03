function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function getDriveFileId(link) {
  var m = link.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=download&id=)([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function getYouTubeId(link) {
  var l = link;
  try { l = decodeURIComponent(link); } catch (e) {}
  if (l.indexOf('youtu.be/') !== -1) return l.split('youtu.be/')[1].slice(0, 11);
  if (l.indexOf('v=') !== -1) return l.split('v=')[1].slice(0, 11);
  if (l.indexOf('shorts/') !== -1) return l.split('shorts/')[1].slice(0, 11);
  return '';
}

async function downloadDriveFile(fileId) {
  var url = 'https://drive.google.com/uc?export=download&id=' + fileId;
  var r = await fetch(url, { redirect: 'follow' });
  var contentType = r.headers.get('content-type') || '';

  if (contentType.indexOf('text/html') !== -1) {
    var html = await r.text();
    var confirmMatch = html.match(/confirm=([0-9A-Za-z_]+)/);
    if (confirmMatch) {
      r = await fetch(url + '&confirm=' + confirmMatch[1], { redirect: 'follow' });
      contentType = r.headers.get('content-type') || '';
    }
  }

  if (contentType.indexOf('text/html') !== -1) {
    throw new Error('Could not download this Google Drive file directly. Make sure sharing is set to "Anyone with the link," and the file is not too large.');
  }

  var buffer = Buffer.from(await r.arrayBuffer());
  return { buffer: buffer, mimeType: contentType || 'video/mp4' };
}

async function uploadToGemini(buffer, mimeType, apiKey) {
  var startRes = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: 'clipflop-video' } })
  });

  var uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Could not start upload to the AI service.');
  }

  var uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: buffer
  });

  var uploadData = await uploadRes.json();
  if (!uploadData.file) {
    throw new Error('Upload to the AI service failed.');
  }

  return uploadData.file;
}

async function waitUntilActive(fileName, apiKey) {
  for (var i = 0; i < 8; i++) {
    var r = await fetch('https://generativelanguage.googleapis.com/v1beta/' + fileName, {
      headers: { 'x-goog-api-key': apiKey }
    });
    var data = await r.json();
    if (data.state === 'ACTIVE') return data;
    if (data.state === 'FAILED') throw new Error('The video could not be processed by the AI service.');
    await wait(3000);
  }
  throw new Error('The video is taking too long to process. Try a shorter video.');
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    var body = req.body || {};
    var link = (body.videoLink || '').trim();
    var duration = body.duration || 20;
    var customPrompt = (body.customPrompt || '').trim();
    var apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: 'API key is missing in Vercel.' });
    }
    if (!link) {
      return res.status(400).json({ message: 'Please provide a YouTube or Google Drive link.' });
    }

    var parts = [];
    var youtubeId = getYouTubeId(link);
    var driveId = getDriveFileId(link);

    if (youtubeId) {
      parts.push({ file_data: { file_uri: 'https://www.youtube.com/watch?v=' + youtubeId } });
    } else if (driveId) {
      var downloaded;
      try {
        downloaded = await downloadDriveFile(driveId);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }

      var uploadedFile;
      try {
        uploadedFile = await uploadToGemini(downloaded.buffer, downloaded.mimeType, apiKey);
      } catch (e) {
        return res.status(500).json({ message: e.message });
      }

      var activeFile;
      try {
        activeFile = await waitUntilActive(uploadedFile.name, apiKey);
      } catch (e) {
        return res.status(500).json({ message: e.message });
      }

      parts.push({ file_data: { file_uri: activeFile.uri, mime_type: activeFile.mimeType } });
    } else {
      return res.status(400).json({ message: 'Please paste a valid YouTube or Google Drive link.' });
    }

    var prompt = 'Watch this video and find the 5 best moments for short clips, each roughly ' + duration + ' seconds long. For each one give: start time, end time (mm:ss), a short title, and one sentence on why it works.
