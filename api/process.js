export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { videoLink } = req.body;

  res.status(200).json({
    message: Received video: ${videoLink || 'uploaded file'}. Highlight detection coming soon!
  });
}
