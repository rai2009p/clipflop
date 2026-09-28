function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    var body = req.body || {};
    var link = decodeURIComponent(body.videoLink || '');
    var id = '';

    if (link.indexOf('youtu.be/') !== -1) {
      id = link.split('youtu.be/')[1].slice(0, 11);
    } else if (link.indexOf('v=') !== -1) {
      id = link.split('v=')[1].slice(0, 11);
    } else if (link.indexOf('shorts/') !== -1) {
      id = link.split('shorts/')[1].slice(0, 11);
    }

    if (!id) {
      return res.status(400).json({ message: 'Please paste a valid YouTube link.' });
    }

    var apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'API key is missing in Vercel.' });
    }

    var videoUrl = 'https://www.youtube.com/watch?v=' + id;
    var prompt = 'Watch this video and find the 5 best moments for short clips. For each one give: start time, end time (mm:ss), a short title, and one sentence on why it works. Use a plain numbered list, no markdown.';

    var requestBody = JSON.stringify({
      contents: [{
        parts: [
          { file_data: { file_uri: videoUrl } },
          { text: prompt }
        ]
      }]
    });

    var r;
    var data;
    var attempts = 2;

    for (var i = 1; i <= attempts; i++) {
      r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: requestBody
        }
      );
      data = await r.json();

      if (r.ok) break;

      var busy = r.status === 429 || r.status === 503;
      if (!busy || i === attempts) break;

      await wait(1000);
    }

    if (!r.ok) {
      var msg = data.error && data.error.message ? data.error.message : String(r.status);
      return res.status(500).json({ message: 'AI error: ' + msg });
    }

    var text = 'No result returned.';
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      text = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    }

    return res.status(200).json({ message: text });
  } catch (e) {
    return res.status(500).json({ message: 'Error: ' + e.message });
  }
};

