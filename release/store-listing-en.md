# Chrome Web Store listing draft (English)

## Product name

ViewTune — Video Pace & Frame

## Short description

Control HTML5 video speed, window fit, and ultrawide crop with unobtrusive physical-key shortcuts.

## Category and language

- Primary category: Productivity
- Locale: English
- Visibility: Public
- Regions: All regions

## Detailed description

ViewTune is a lightweight Chrome extension for controlling the playback speed and presentation of HTML5 web videos, including YouTube, with the keyboard.

It does not place permanent controls over the page. Use physical-key shortcuts or the extension popup; a short on-video message appears only after an action.

Key features

- Lower or raise playback speed in 0.5× steps, or reset it to 1×
- Jump directly to a configurable target speed (2× by default)
- Fit a verified player and its controls to the current browser tab
- Fill an ultrawide frame by cropping only the video, without resizing the player or page
- Physical-key shortcuts that work independently of Korean or English input mode
- Configurable shortcuts, target speed, and on-video feedback
- English and Korean interface based on the Chrome language

Default shortcuts

- B: Toggle 21:9 video crop
- V: Toggle fit to window (or press Esc to exit)
- G: Apply the target speed (2× by default)
- [: Decrease speed by 0.5×
- ]: Increase speed by 0.5×
- R: Reset speed to 1×

ViewTune safely validates player geometry for repeated YouTube layout changes, Laftel controls that hide automatically, and Netflix 21:9 crop in fullscreen. It does not depend on a single site-specific element ID, and it leaves the page unchanged when the required player boundary cannot be verified.

ViewTune has no ads, analytics, accounts, or developer server. Video and player layout are processed only inside the browser while a feature runs and are never stored or transmitted. Only shortcut, target-speed, and feedback preferences are saved with Chrome Storage Sync.

Limitations

- Players that do not expose an HTML `<video>` element, including some DRM or canvas-based players, cannot be controlled.
- Fit to window is safely declined when a site does not expose a verifiable player boundary or when native fullscreen or Picture-in-Picture would conflict.
- 21:9 crop applies only when the current frame is sufficiently wider than the source video, and it may crop the top and bottom of the picture.
- On Netflix, playback speed is limited to 1.5× for stable frame updates. If the video is playing, ViewTune briefly pauses it, applies the speed, and resumes playback.
