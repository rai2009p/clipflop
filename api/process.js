module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const body = req.body || {};
  const videoLink = body.videoLink;

  res.status(200).json({
    message: 'Received video: ' + (videoLink || 'uploaded file') + '. Highlight detection coming soon!'
  });
};
5:02 PM
Park Chao Mei
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    const link = (req.body && req.body.videoLink) || '';
    const m = link.match(/(?:youtu\.be\/|youtu\.be%2F|v=|v%3D|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (!m) {
      return res.status(400).json({ message: 'Please paste a valid YouTube link.' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'API key is missing in Vercel.' });
    }
    const url = 'https://www.youtube.com/watch?v=' + m[1];
    const prompt = 'Watch this video and find the 5 best moments for short clips (funny, exciting, or important). For each one give: start time, end time (mm:ss), a short title, and one sentence on why it works. Use a plain numbered list, no markdown.';

    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ file_data: { file_uri: url } }, { text: prompt }] }]
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      const msg = (data.error && data.error.message) || r.status;
      return res.status(500).json({ message: 'AI error: ' + msg });
    }
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || '').join('') || 'No result returned.';
    res.status(200).json({ message: text });
  } catch (e) {
    res.status(500).json({ message: 'Error: ' + e.message });
  }
};
