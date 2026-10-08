//! Motor de Spotify do ALL MUSIC: login, biblioteca e reprodução via librespot, sem Client ID
//! do usuário.
//!
//! Conversa com o app hospedeiro por linhas JSON: comandos chegam pelo stdin, eventos saem
//! pelo stdout. Comandos com `req` recebem uma resposta `{"ev":"result","req":…}`. Linhas do
//! stdout que não começam com `{` são ruído de bibliotecas e devem ser ignoradas por quem lê.

mod fx;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use futures_util::{stream, StreamExt};
use http::{header::CONTENT_TYPE, HeaderMap, HeaderValue, Method};
use librespot_core::{
    authentication::Credentials, cache::Cache, config::SessionConfig, session::Session, SpotifyId, SpotifyUri,
};
use librespot_metadata::{image::{ImageSize, Images}, Album, Artist, Metadata, Track};
use librespot_oauth::{OAuthClientBuilder, OAuthToken};
use librespot_playback::{
    audio_backend,
    config::{AudioFormat, Bitrate, PlayerConfig, VolumeCtrl},
    mixer::{self, Mixer, MixerConfig},
    player::{Player, PlayerEvent, PlayerEventChannel},
};
use librespot_protocol::playlist4_external::SelectedListContent;
use protobuf::Message;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};

type AnyError = Box<dyn std::error::Error + Send + Sync>;

// O mesmo Client ID que o librespot e os clientes baseados nele usam para o login.
const CLIENT_ID: &str = "65b708073fc0480ea92a077233ca87bd";
const REDIRECT_URI: &str = "http://127.0.0.1:8898/login";
const SCOPES: &[&str] = &[
    "streaming",
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
];
const DJ_PLAYLIST: &str = "37i9dQZF1EYkqdzj48dyYq";

/// Página mostrada no navegador depois do login, no idioma escolhido no app (ALLMUSIC_LANG).
fn login_page() -> String {
    let message = match std::env::var("ALLMUSIC_LANG").as_deref() {
        Ok("pt") => "Tudo certo — pode fechar esta aba e voltar para o ALL MUSIC.",
        Ok("es") => "Todo listo: puedes cerrar esta pestaña y volver a ALL MUSIC.",
        _ => "All set — you can close this tab and go back to ALL MUSIC.",
    };
    format!(
        "<!doctype html><meta charset=utf-8><title>ALL MUSIC</title>\
<body style=\"background:#0B0B0C;color:#F7F5F2;font:16px 'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0\">\
<p>{message}</p><script>setTimeout(() => window.close(), 400)</script>"
    )
}

#[derive(Deserialize)]
struct Request {
    /// Número do pedido, devolvido na resposta. (`id` fica livre para os próprios comandos.)
    #[serde(rename = "req")]
    id: Option<u64>,
    #[serde(flatten)]
    command: Command,
}

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    Login,
    Logout,
    Quit,
    // reprodução
    Load { uri: String, #[serde(default)] pos: u32 },
    Play,
    Pause,
    Seek { ms: u32 },
    Volume { v: f64 },
    /// Efeito de áudio ("off", "muffled" ou "8d") e, opcionalmente, seus ajustes (ver `fx::Config`).
    Fx {
        name: String,
        cutoff: Option<f64>, q: Option<f64>, steep: Option<bool>, hp: Option<f64>, gain: Option<f64>,
        turn: Option<f64>, depth: Option<f64>, echo: Option<f64>, hop: Option<bool>,
    },
    // biblioteca
    Profile,
    Liked,
    Playlists,
    Playlist { id: String },
    Search { q: String },
    Tracks { uris: Vec<String> },
    Like { uri: String, on: bool },
    Artist { id: String },
    Album { id: String },
}

fn emit(event: Value) {
    println!("{event}");
}

fn fail(context: &str, err: impl std::fmt::Display) {
    emit(json!({ "ev": "error", "msg": format!("{context}: {err}") }));
}

// ---------- sessão e player ----------

struct Engine {
    session: Session,
    player: Arc<Player>,
    mixer: Arc<dyn Mixer>,
}

async fn connect(credentials: Credentials, cache: &Cache, volume: u16, effect: fx::Shared) -> Result<(Engine, PlayerEventChannel), AnyError> {
    let session = Session::new(SessionConfig::default(), Some(cache.clone()));
    session.connect(credentials, true).await?;

    // Volume linear e normalização ligada: o mesmo comportamento do player do YouTube, para as
    // faixas das duas origens soarem na mesma altura com o controle na mesma posição.
    let mixer = mixer::find(None).ok_or("mixer indisponível")?(MixerConfig { volume_ctrl: VolumeCtrl::Linear, ..MixerConfig::default() })?;
    mixer.set_volume(volume);
    let backend = audio_backend::find(None).ok_or("saída de áudio indisponível")?;
    let config = PlayerConfig { bitrate: Bitrate::Bitrate320, normalisation: true, ..PlayerConfig::default() };
    let player = Player::new(config, session.clone(), mixer.get_soft_volume(), move || {
        Box::new(fx::FxSink::new(backend(None, AudioFormat::default()), effect))
    });
    let events = player.get_player_event_channel();
    Ok((Engine { session, player, mixer }, events))
}

fn browser_login() -> Result<OAuthToken, AnyError> {
    let client = OAuthClientBuilder::new(CLIENT_ID, REDIRECT_URI, SCOPES.to_vec())
        .with_custom_message(&login_page())
        .open_in_browser()
        .build()?;
    Ok(client.get_access_token()?)
}

async fn next_event(events: &mut Option<PlayerEventChannel>) -> Option<PlayerEvent> {
    match events {
        Some(channel) => channel.recv().await,
        None => std::future::pending().await,
    }
}

fn report(event: PlayerEvent) {
    match event {
        PlayerEvent::Loading { position_ms, .. } => emit(json!({ "ev": "loading", "pos": position_ms })),
        PlayerEvent::Playing { position_ms, .. } => emit(json!({ "ev": "playing", "pos": position_ms })),
        PlayerEvent::Paused { position_ms, .. } => emit(json!({ "ev": "paused", "pos": position_ms })),
        PlayerEvent::Seeked { position_ms, .. } | PlayerEvent::PositionCorrection { position_ms, .. } => {
            emit(json!({ "ev": "position", "pos": position_ms }))
        }
        PlayerEvent::TrackChanged { audio_item } => emit(json!({ "ev": "track", "dur": audio_item.duration_ms })),
        PlayerEvent::EndOfTrack { .. } => emit(json!({ "ev": "ended" })),
        PlayerEvent::Unavailable { .. } => emit(json!({ "ev": "unavailable" })),
        _ => {}
    }
}

// ---------- biblioteca ----------

/// Metadados de faixas já vistos, em memória e em disco, para não pedir de novo a cada abertura.
struct TrackCache {
    path: PathBuf,
    map: Mutex<HashMap<String, Value>>,
}

impl TrackCache {
    fn open(path: PathBuf) -> Self {
        let map = std::fs::read_to_string(&path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        Self { path, map: Mutex::new(map) }
    }

    fn get(&self, uri: &str) -> Option<Value> {
        self.map.lock().unwrap().get(uri).cloned()
    }

    fn add(&self, entries: Vec<(String, Value)>) {
        if entries.is_empty() {
            return;
        }
        let mut map = self.map.lock().unwrap();
        map.extend(entries);
        if let Ok(text) = serde_json::to_string(&*map) {
            let _ = std::fs::write(&self.path, text);
        }
    }
}

/// Endereço da imagem no tamanho pedido (ou da primeira disponível).
fn image_url(images: &Images, wanted: ImageSize) -> String {
    images.iter().find(|c| c.size == wanted).or(images.first()).and_then(|c| c.id.to_base16().ok())
        .map(|id| format!("https://i.scdn.co/image/{id}"))
        .unwrap_or_default()
}

fn bare_id(uri: &SpotifyUri) -> String {
    uri.to_uri().ok().and_then(|u| u.rsplit(':').next().map(str::to_owned)).unwrap_or_default()
}

async fn track_info(session: &Session, uri: &str) -> Option<Value> {
    let track = Track::get(session, &SpotifyUri::from_uri(uri).ok()?).await.ok()?;
    let cover = |wanted: ImageSize| image_url(&track.album.covers, wanted);
    Some(json!({
        "src": "sp",
        "id": uri.rsplit(':').next().unwrap_or_default(),
        "uri": uri,
        "title": track.name,
        "artist": track.artists.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", "),
        "artists": track.artists.iter().map(|a| json!({ "id": bare_id(&a.id), "name": a.name })).collect::<Vec<_>>(),
        "album": { "id": bare_id(&track.album.id), "name": track.album.name },
        "art": cover(ImageSize::SMALL),
        "artBig": cover(ImageSize::LARGE),
        "dur": track.duration,
    }))
}

async fn tracks(session: &Session, cache: &TrackCache, uris: Vec<String>) -> Value {
    let found = stream::iter(uris)
        .map(|uri| async move {
            match cache.get(&uri) {
                Some(info) => (uri, Some(info), false),
                None => {
                    let info = track_info(session, &uri).await;
                    (uri, info, true)
                }
            }
        })
        .buffered(8)
        .collect::<Vec<_>>()
        .await;
    cache.add(found.iter().filter(|(_, info, new)| *new && info.is_some()).map(|(uri, info, _)| (uri.clone(), info.clone().unwrap())).collect());
    // Faixas que o Spotify não devolveu (removidas, bloqueadas na região) simplesmente não aparecem.
    Value::Array(found.into_iter().filter_map(|(_, info, _)| info).collect())
}

/// Lista de referências `{uri, at}` de um contexto (curtidas, busca), sem metadados.
async fn context_refs(session: &Session, uri: &str) -> Result<Value, AnyError> {
    let context = session.spclient().get_context(uri).await?;
    let refs = context.pages.iter().flat_map(|page| page.tracks.iter()).filter_map(|track| {
        let uri = track.uri.as_deref().filter(|u| u.starts_with("spotify:track:"))?;
        let at = track.metadata.get("added_at").and_then(|v| v.parse::<u64>().ok());
        Some(json!({ "uri": uri, "at": at }))
    });
    Ok(Value::Array(refs.collect()))
}

async fn playlists(session: &Session) -> Result<Value, AnyError> {
    let bytes = session.spclient().get_rootlist(0, Some(500)).await?;
    let list = SelectedListContent::parse_from_bytes(&bytes)?;
    let Some(contents) = list.contents.as_ref() else { return Ok(json!([])) };
    let items = contents.items.iter().zip(contents.meta_items.iter()).filter_map(|(item, meta)| {
        // A lista também traz marcadores de pasta (start-group/end-group); só playlists interessam.
        let id = item.uri().strip_prefix("spotify:playlist:")?;
        let attributes = meta.attributes.as_ref()?;
        // O "DJ" do Spotify é uma rádio gerada por IA, não uma lista de faixas: aqui não toca.
        if id == DJ_PLAYLIST || attributes.format().to_ascii_lowercase().contains("dj") {
            return None;
        }
        let image = attributes.picture_size.iter().find(|p| p.target_name() == "default").or(attributes.picture_size.first());
        Some(json!({ "id": id, "name": attributes.name(), "owner": meta.owner_username(), "image": image.map(|p| p.url()) }))
    });
    Ok(Value::Array(items.collect()))
}

async fn playlist_refs(session: &Session, id: &str) -> Result<Value, AnyError> {
    let bytes = session.spclient().get_playlist(&SpotifyId::from_base62(id)?).await?;
    let list = SelectedListContent::parse_from_bytes(&bytes)?;
    let Some(contents) = list.contents.as_ref() else { return Ok(json!([])) };
    let refs = contents.items.iter().filter(|item| item.uri().starts_with("spotify:track:")).map(|item| {
        json!({ "uri": item.uri(), "at": item.attributes.as_ref().map(|a| a.timestamp()) })
    });
    Ok(Value::Array(refs.collect()))
}

fn search_uri(query: &str) -> String {
    let words = query.split_whitespace().map(|word| {
        word.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>()
    });
    format!("spotify:search:{}", words.collect::<Vec<_>>().join("+"))
}

// O librespot não traz a mensagem de escrita na coleção compilada; ela é pequena o bastante
// para montar à mão (collection2v2.proto: WriteRequest { username, set, items[] }).
fn pb_varint(mut value: u64, out: &mut Vec<u8>) {
    while value >= 0x80 {
        out.push((value as u8 & 0x7F) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

fn pb_bytes(field: u64, data: &[u8], out: &mut Vec<u8>) {
    pb_varint(field << 3 | 2, out);
    pb_varint(data.len() as u64, out);
    out.extend_from_slice(data);
}

async fn set_liked(session: &Session, uri: &str, on: bool) -> Result<Value, AnyError> {
    let mut item = Vec::new();
    pb_bytes(1, uri.as_bytes(), &mut item);
    pb_varint(2 << 3, &mut item);
    pb_varint(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(), &mut item);
    if !on {
        pb_varint(3 << 3, &mut item);
        pb_varint(1, &mut item);
    }
    let mut body = Vec::new();
    pb_bytes(1, session.username().as_bytes(), &mut body);
    pb_bytes(2, b"collection", &mut body);
    pb_bytes(3, &item, &mut body);

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/vnd.collection-v2.spotify.proto"));
    session.spclient().request(&Method::POST, "/collection/v2/write", Some(headers), Some(&body)).await?;
    Ok(Value::Null)
}

async fn album_card(session: &Session, uri: &SpotifyUri) -> Option<Value> {
    let album = Album::get(session, uri).await.ok()?;
    Some(json!({
        "id": bare_id(uri),
        "name": album.name,
        "year": album.date.as_utc().year(),
        "image": image_url(&album.covers, ImageSize::DEFAULT),
    }))
}

/// Perfil do artista: foto, faixas mais populares no país da conta e discografia.
async fn artist(session: &Session, id: &str) -> Result<Value, AnyError> {
    let artist = Artist::get(session, &SpotifyUri::from_uri(&format!("spotify:artist:{id}"))?).await?;
    let portraits = if artist.portraits.is_empty() { &artist.portrait_group } else { &artist.portraits };
    let top: Vec<Value> = artist.top_tracks.for_country(&session.country()).iter()
        .filter_map(|uri| uri.to_uri().ok())
        .map(|uri| json!({ "uri": uri }))
        .collect();
    // álbuns primeiro, depois singles; uma versão de cada, no máximo 24 no total
    let releases: Vec<SpotifyUri> = artist.albums.current_releases().chain(artist.singles.current_releases()).take(24).cloned().collect();
    let albums = stream::iter(releases).map(|uri| async move { album_card(session, &uri).await }).buffered(8)
        .filter_map(|card| async move { card })
        .collect::<Vec<_>>()
        .await;
    Ok(json!({ "id": id, "name": artist.name, "image": image_url(portraits, ImageSize::LARGE), "top": top, "albums": albums }))
}

async fn album(session: &Session, id: &str) -> Result<Value, AnyError> {
    let album = Album::get(session, &SpotifyUri::from_uri(&format!("spotify:album:{id}"))?).await?;
    let refs: Vec<Value> = album.tracks().filter_map(|uri| uri.to_uri().ok()).map(|uri| json!({ "uri": uri })).collect();
    Ok(json!({
        "id": id,
        "name": album.name,
        "artist": album.artists.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", "),
        "year": album.date.as_utc().year(),
        "image": image_url(&album.covers, ImageSize::LARGE),
        "refs": refs,
    }))
}

async fn library(session: Session, cache: Arc<TrackCache>, command: Command) -> Result<Value, AnyError> {
    match command {
        Command::Profile => {
            let user = session.username();
            let profile = session.spclient().get_user_profile(&user, None, None).await.ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .unwrap_or_default();
            Ok(json!({ "user": user, "name": profile["name"], "image": profile["image_url"] }))
        }
        Command::Liked => context_refs(&session, &format!("spotify:user:{}:collection", session.username())).await,
        Command::Playlists => playlists(&session).await,
        Command::Playlist { id } => playlist_refs(&session, &id).await,
        Command::Search { q } => context_refs(&session, &search_uri(&q)).await,
        Command::Tracks { uris } => Ok(tracks(&session, &cache, uris).await),
        Command::Like { uri, on } => set_liked(&session, &uri, on).await,
        Command::Artist { id } => artist(&session, &id).await,
        Command::Album { id } => album(&session, &id).await,
        _ => Err("comando sem resposta".into()),
    }
}

// ---------- laço principal ----------

/// Avisos e erros do librespot, e qualquer pânico, vão para o stderr; o host grava em engine.log.
struct StderrLog;

impl log::Log for StderrLog {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::Level::Warn
    }
    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            eprintln!("[{}] {}: {}", record.level(), record.target(), record.args());
        }
    }
    fn flush(&self) {}
}

#[tokio::main]
async fn main() {
    let _ = log::set_logger(&StderrLog).map(|()| log::set_max_level(log::LevelFilter::Warn));
    std::panic::set_hook(Box::new(|info| eprintln!("panic: {info}")));

    let dir = std::env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("allmusic").join("engine")
    });
    let cache = match Cache::new(Some(dir.clone()), Some(dir.clone()), None, None) {
        Ok(cache) => cache,
        Err(err) => return fail("pasta de dados", err),
    };
    // tracks2: o formato passou a guardar os artistas e o álbum de cada faixa
    let track_cache = Arc::new(TrackCache::open(dir.join("tracks2.json")));
    let effect = fx::Shared::default();
    let mut volume = u16::MAX / 2;
    let mut engine: Option<Engine> = None;
    let mut events: Option<PlayerEventChannel> = None;

    // Login salvo de uma execução anterior.
    match cache.credentials() {
        Some(credentials) => match connect(credentials, &cache, volume, effect.clone()).await {
            Ok((e, ch)) => {
                emit(json!({ "ev": "ready", "user": e.session.username() }));
                engine = Some(e);
                events = Some(ch);
            }
            Err(err) => {
                fail("reconectar", err);
                emit(json!({ "ev": "need_login" }));
            }
        },
        None => emit(json!({ "ev": "need_login" })),
    }

    // O login no navegador roda à parte e devolve o resultado por este canal. Enquanto a pessoa
    // não confirma, o motor continua atendendo os outros comandos.
    let (login_tx, mut login_rx) = tokio::sync::mpsc::unbounded_channel::<Result<OAuthToken, String>>();
    let mut login_pending = false;

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    loop {
        tokio::select! {
            Some(result) = login_rx.recv() => {
                login_pending = false;
                match result {
                    Ok(token) => match connect(Credentials::with_access_token(&token.access_token), &cache, volume, effect.clone()).await {
                        Ok((e, ch)) => {
                            emit(json!({ "ev": "ready", "user": e.session.username() }));
                            engine = Some(e);
                            events = Some(ch);
                        }
                        Err(err) => { fail("conectar", err); emit(json!({ "ev": "need_login" })); }
                    },
                    Err(err) => { fail("login", err); emit(json!({ "ev": "need_login" })); }
                }
            },
            event = next_event(&mut events) => match event {
                Some(event) => report(event),
                None => events = None,
            },
            line = lines.next_line() => {
                let Ok(Some(line)) = line else { break };
                if line.trim().is_empty() { continue; }
                let Request { id, command } = match serde_json::from_str::<Request>(&line) {
                    Ok(request) => request,
                    Err(err) => { fail("comando inválido", err); continue; }
                };

                // A conexão cai depois de muito tempo parada ou quando o PC dorme; refaz com o login salvo.
                if engine.as_ref().is_some_and(|e| e.session.is_invalid()) {
                    engine = None;
                    events = None;
                    if let Some(credentials) = cache.credentials() {
                        match connect(credentials, &cache, volume, effect.clone()).await {
                            Ok((e, ch)) => { engine = Some(e); events = Some(ch); }
                            Err(err) => fail("reconectar", err),
                        }
                    }
                    if engine.is_none() { emit(json!({ "ev": "need_login" })); }
                }

                match command {
                    Command::Quit => break,
                    Command::Login => {
                        // Um segundo pedido (duplo clique, por exemplo) não abre outro login.
                        if let Some(e) = engine.as_ref() {
                            emit(json!({ "ev": "ready", "user": e.session.username() }));
                        } else {
                            emit(json!({ "ev": "login_started" }));
                            if !login_pending {
                                login_pending = true;
                                let tx = login_tx.clone();
                                tokio::task::spawn_blocking(move || {
                                    let _ = tx.send(browser_login().map_err(|err| err.to_string()));
                                });
                            }
                        }
                    }
                    Command::Logout => {
                        if let Some(e) = engine.take() {
                            e.player.stop();
                            e.session.shutdown();
                        }
                        events = None;
                        let _ = std::fs::remove_file(dir.join("credentials.json"));
                        emit(json!({ "ev": "need_login" }));
                    }
                    command => {
                        let Some(e) = engine.as_ref() else {
                            match id {
                                Some(id) => emit(json!({ "ev": "result", "req": id, "error": "sem login" })),
                                None => fail("player", "sem login"),
                            }
                            continue;
                        };
                        match command {
                            Command::Load { uri, pos } => match SpotifyUri::from_uri(&uri) {
                                Ok(uri) => e.player.load(uri, true, pos),
                                Err(err) => fail("faixa inválida", err),
                            },
                            Command::Play => e.player.play(),
                            Command::Pause => e.player.pause(),
                            Command::Seek { ms } => e.player.seek(ms),
                            Command::Fx { name, cutoff, q, steep, hp, gain, turn, depth, echo, hop } => {
                                let mut config = effect.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                                config.effect = fx::by_name(&name);
                                if let Some(v) = cutoff { config.cutoff = v.clamp(80.0, 8000.0); }
                                if let Some(v) = q { config.q = v.clamp(0.5, 6.0); }
                                if let Some(v) = steep { config.steep = v; }
                                if let Some(v) = hp { config.hp = v.clamp(0.0, 800.0); }
                                if let Some(v) = hop { config.hop = v; }
                                if let Some(v) = gain { config.gain = v.clamp(0.2, 4.0); }
                                if let Some(v) = turn { config.turn = v.clamp(2.0, 40.0); }
                                if let Some(v) = depth { config.depth = v.clamp(0.0, 1.0); }
                                if let Some(v) = echo { config.echo = v.clamp(0.0, 1.0); }
                            }
                            Command::Volume { v } => {
                                volume = (v.clamp(0.0, 1.0) * f64::from(u16::MAX)) as u16;
                                e.mixer.set_volume(volume);
                            }
                            // Consultas rodam à parte para não travar os comandos do player.
                            command => {
                                let (session, cache) = (e.session.clone(), track_cache.clone());
                                tokio::spawn(async move {
                                    let Some(id) = id else { return };
                                    match library(session, cache, command).await {
                                        Ok(data) => emit(json!({ "ev": "result", "req": id, "data": data })),
                                        Err(err) => emit(json!({ "ev": "result", "req": id, "error": err.to_string() })),
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(e) = engine {
        e.player.stop();
        e.session.shutdown();
    }
    // Um login pendente no navegador ficaria segurando o processo aberto.
    std::process::exit(0);
}
