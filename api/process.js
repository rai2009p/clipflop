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
