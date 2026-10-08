# ALL MUSIC

Spotify and YouTube in one queue, in one small Windows app.

Paste a YouTube link and it plays (audio only) alongside your Spotify library: same queue, same playlists, no browser tab open.

> Independent project. Not affiliated with, sponsored by or endorsed by Spotify or YouTube.

## Download

Get `allmusic.exe` from the [latest release](../../releases/latest). It is a single file: no installer, nothing else to install on Windows 10/11.

The file is not code-signed, so Windows SmartScreen shows a warning the first time you run it. If you would rather not trust a binary, [build it yourself](#build-from-source); every line that goes into the `.exe` is in this repository.

## What it does

- **One queue for both.** Spotify tracks and YouTube links play back to back, and local playlists can mix the two.
- **YouTube as audio.** Search YouTube by name or paste a link; no video is shown.
- **Search both.** The search box has a Spotify tab and a YouTube tab, and you can like a song right from the results.
- **Audio effects.** Muffled and 8D, each with presets and sliders you can change while the music plays. They work on Spotify and YouTube tracks.
- **Artist and album pages.** Click an artist's name for their top tracks and discography.
- **One-click Spotify sign-in.** You confirm on Spotify's own site, in your browser. No developer key needed.
- **Works without Spotify.** Close the welcome screen to use it with YouTube links only.
- **Stays out of the way.** Minimizing sends it to the tray; keyboard media keys keep working.
- **Home screen with your stats.** Plays, top artists and top tracks, counted locally.
- **English, Portuguese and Spanish.**

Spotify playback requires a Spotify Premium account (a librespot limitation).

## What it talks to, and what it stores

This is the part worth checking in the code if you are deciding whether to trust it.

**Network.** The app talks only to Spotify and YouTube. There is no ALL MUSIC server, no account, no analytics and no telemetry.

| Destination | Why | Where in the code |
|---|---|---|
| `accounts.spotify.com` | Sign-in, in your own browser | `engine/src/main.rs` (`browser_login`) |
| Spotify access points and `spclient` | Library, search, audio | `engine/src/main.rs`, via [librespot](https://github.com/librespot-org/librespot) |
| `i.scdn.co`, `i.ytimg.com` | Cover art | `ui/js/app.js` |
| `www.youtube.com` | The official embedded player, `oembed` for a video's title, and the search results page for YouTube search | `ui/js/youtube.js`, `host/LocalServer.cs` |

**Your password never reaches the app.** Sign-in is OAuth with PKCE: Spotify's site hands the app an authorization, not your credentials.

**Local files.** Everything lives in `%LOCALAPPDATA%\allmusic`:

| Path | Contents |
|---|---|
| `engine\credentials.json` | The Spotify authorization (not your password). Deleted when you sign out. |
| `engine\tracks.json` | Cache of track names and cover URLs |
| `EBWebView\` | Local playlists, liked YouTube links, play counts, language |
| `bin\` | The Spotify engine, extracted from the `.exe` |
| `engine.log` | Engine errors, for troubleshooting |

To remove the app completely, delete `allmusic.exe` and that folder. Nothing is written to the registry.

**Local port.** The interface is served from `127.0.0.1:38417`, bound to loopback only, because the YouTube player needs a real `http` origin. During sign-in the engine also listens on `127.0.0.1:8898` for Spotify's redirect.

## How it works

| Folder | What it is |
|---|---|
| `host/` | .NET 10 WinForms window hosting WebView2: title bar, tray, media keys, local server |
| `ui/` | The interface: plain HTML, CSS and JavaScript modules, no framework and no build step |
| `engine/` | Rust process built on librespot: Spotify sign-in, library and audio. Talks to the host over JSON lines on stdin/stdout |
| `landing/` | The website |
| `video/` | Remotion sources for the promo videos |
| `tools/` | Scripts that generate icons, fonts and the logo, and record the app for the videos |

The published `.exe` embeds the interface and the engine; the engine is extracted to the data folder on first run.

## Build from source

You need the [.NET 10 SDK](https://dotnet.microsoft.com/download), [Rust](https://rustup.rs) with the MSVC toolchain (Visual Studio Build Tools, "Desktop development with C++"), and [Node.js](https://nodejs.org) if you want to regenerate the icons and fonts.

```bash
cargo build --release --manifest-path engine/Cargo.toml
```

```bash
dotnet publish host/AllMusic.csproj -c Release -o dist
```

The result is `dist/allmusic.exe`. The generated assets (`ui/icons.svg`, `ui/fonts`, `ui/logo.png`, `host/app.ico`) are committed, so Node is optional; to rebuild them:

```bash
npm install
```

```bash
npm run assets
```

## Things you should know

- **It is unofficial.** Spotify access goes through librespot, an open-source reimplementation of Spotify's client protocol. This is outside Spotify's terms of use, it can stop working whenever Spotify changes something, and you use it at your own risk.
- **YouTube search reads the results page.** YouTube has no keyless search API, so the app fetches the public results page and reads the videos from it. It can break when YouTube changes that page.
- **Effects on YouTube tracks run inside the player frame.** The app injects `ui/js/yt-fx.js` into the embedded player to route its audio through Web Audio filters; nothing else in the frame is touched.
- **YouTube ads.** Playback uses YouTube's official embedded player, which may play ads on some videos. Some videos block embedded playback and cannot be played.
- **Play counts are local.** They start when you start using the app; Spotify does not expose your play history.
- **Windows only.**

## Credits

- [librespot](https://github.com/librespot-org/librespot) (MIT)
- [Hugeicons](https://hugeicons.com) free icons (MIT)
- [Inter](https://rsms.me/inter/) and [Space Grotesk](https://github.com/floriankarsten/space-grotesk) (SIL Open Font License 1.1)
- [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

[MIT](LICENSE)
