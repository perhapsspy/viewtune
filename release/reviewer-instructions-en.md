# Reviewer test instructions

No login or test account is required for the core test.

1. Install the extension and open a public page with an HTML5 video. A public YouTube video or `https://interactive-examples.mdn.mozilla.net/pages/tabbed/video.html` can be used.
2. Play the video and press `[` and `]`. Playback speed changes in 0.5× steps.
3. Press `R`. Playback speed returns to 1×.
4. Press `G`. The default target speed of 2× is applied immediately.
5. On a page with a safely identifiable HTML player and controls, press `V`. The player and controls fill the current browser tab. Press `V` again or press `Esc` to restore the original layout.
6. In a player or fullscreen view that is wider than the source video, press `B`. Only the video is cropped to fill the current frame; the frame itself does not resize. A no-applicable-crop message is expected in a standard 16:9 frame.
7. Run the same actions from the extension popup and select the gear button. Change physical-key shortcuts, target speed, and on-screen feedback directly inside the popup.
8. The interface is shown in Korean when Chrome uses Korean and in English in other supported environments.

Optional compatibility checks

- On YouTube, switch between the standard layout and Theater mode with `T`. Repeated `V` on/off cycles restore the player and its controls together.
- On Laftel, `V` fits the verified player frame even after its controls hide automatically. A service account with access to a video may be required.

For safety, ViewTune does not apply fit to window inside an iframe, while native fullscreen or Picture-in-Picture is active, when an existing Popover would conflict, or when it cannot verify a player boundary. This is intentional.
