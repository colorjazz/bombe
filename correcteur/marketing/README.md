# Publicités

- `pub-brulelapile-fr.png`, `pub-burnthepile-en.png` : images 1080 × 1350 (fil Facebook / Instagram). Sources : `pub-fr.html`, `pub-en.html`.
- `video-brulelapile-fr.mp4`, `video-burnthepile-en.mp4` : vidéos 15 s, 1080 × 1920 (Reels, Stories), sans son.
  Sources : `video-fr.html`, `video-en.html` (animation pilotée par `render(t)`).

Régénérer une vidéo (Playwright + ffmpeg) :

    mkdir -p f && node video-frames.mjs "$PWD" fr all
    ffmpeg -framerate 30 -i f/fr_%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart video-brulelapile-fr.mp4
