# Third-party notices

ALL MUSIC includes or depends on the following third-party software and assets. Each remains under its own license.

## Shipped inside `allmusic.exe`

| Component | License | Source |
|---|---|---|
| librespot (core, oauth, playback, metadata, protocol) and its Rust dependencies | MIT | https://github.com/librespot-org/librespot |
| Hugeicons free icon set (`@hugeicons/core-free-icons`) | MIT | https://hugeicons.com |
| Inter typeface | SIL Open Font License 1.1 | https://rsms.me/inter/ |
| Space Grotesk typeface | SIL Open Font License 1.1 | https://github.com/floriankarsten/space-grotesk |
| .NET runtime | MIT | https://github.com/dotnet/runtime |
| Microsoft.Web.WebView2 SDK | Microsoft Software License | https://www.nuget.org/packages/Microsoft.Web.WebView2 |

The full dependency list of the engine, with versions, is in `engine/Cargo.lock`. Run `cargo tree --manifest-path engine/Cargo.toml` to see it; each crate carries its license in its own repository.

## Used at runtime, not shipped

| Component | Notes |
|---|---|
| Microsoft Edge WebView2 Runtime | Part of Windows 11; installed with Microsoft Edge on Windows 10 |
| YouTube IFrame Player API | Loaded from youtube.com when a YouTube link is played; subject to YouTube's terms |

## Development tools only

| Component | License |
|---|---|
| sharp | Apache-2.0 |
| @fontsource-variable/inter, @fontsource-variable/space-grotesk | OFL-1.1 |
| Remotion (promo videos in `video/`) | Remotion License; free for individuals and small teams, see https://remotion.dev/license |

## Trademarks

Spotify and YouTube are trademarks of their respective owners. ALL MUSIC is an independent project and is not affiliated with, sponsored by or endorsed by either company.
