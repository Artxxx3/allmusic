// Idiomas do app. O código e o HTML estão em português, e cada texto em português é a
// chave da tradução (estilo gettext): `t('Nova playlist')`. Texto sem tradução fica como está.
// Para acrescentar um idioma: inclua-o em LANGUAGES e adicione uma coluna em ROWS.
import { store } from './store.js';

export const LANGUAGES = { pt: 'Português', en: 'English', es: 'Español' };

// [português, inglês, espanhol]
const ROWS = [
  // onboarding
  ['Toda a sua música.', 'All your music.', 'Toda tu música.'],
  ['Um lugar só.', 'One place.', 'Un solo lugar.'],
  ['Sua biblioteca do Spotify e aquelas músicas que só existem no YouTube, na mesma fila, sem navegador aberto.',
    'Your Spotify library and those songs that only exist on YouTube, in one queue, with no browser open.',
    'Tu biblioteca de Spotify y esas canciones que solo existen en YouTube, en la misma cola, sin navegador abierto.'],
  ['Bem-vindo ao ALL MUSIC', 'Welcome to ALL MUSIC', 'Bienvenido a ALL MUSIC'],
  ['Para começar, entre com a sua conta do Spotify. É ela que traz suas playlists, curtidas e a reprodução.',
    'To get started, sign in with your Spotify account. It brings your playlists, liked songs and playback.',
    'Para empezar, entra con tu cuenta de Spotify. Es la que trae tus playlists, favoritos y la reproducción.'],
  ['Requer Spotify Premium para tocar', 'Spotify Premium is required to play', 'Requiere Spotify Premium para reproducir'],
  ['Seu login acontece no site do Spotify, no seu navegador', 'You sign in on Spotify\'s site, in your browser', 'Inicias sesión en el sitio de Spotify, en tu navegador'],
  ['Um clique: sem chave nem cadastro de desenvolvedor', 'One click: no key and no developer sign-up', 'Un clic: sin clave ni registro de desarrollador'],
  ['Conectar com Spotify', 'Connect with Spotify', 'Conectar con Spotify'],
  ['Fechar esta tela entra sem Spotify, só com músicas do YouTube. Dá para conectar depois pelo ícone de conta.',
    'Closing this screen enters without Spotify, with YouTube songs only. You can connect later from the account icon.',
    'Cerrar esta pantalla entra sin Spotify, solo con canciones de YouTube. Puedes conectar después desde el icono de cuenta.'],
  ['Entrar sem Spotify', 'Enter without Spotify', 'Entrar sin Spotify'],
  ['Iniciando…', 'Starting…', 'Iniciando…'],
  ['Confirme no navegador que abriu. Esta tela continua sozinha quando você voltar.',
    'Confirm in the browser that just opened. This screen continues on its own when you come back.',
    'Confirma en el navegador que se abrió. Esta pantalla continúa sola cuando vuelvas.'],
  ['Confirme o login do Spotify no navegador que abriu', 'Confirm the Spotify sign-in in the browser that just opened', 'Confirma el inicio de sesión de Spotify en el navegador que se abrió'],
  ['O motor do Spotify não iniciou. Clique em conectar para tentar de novo.', 'The Spotify engine did not start. Click connect to try again.', 'El motor de Spotify no se inició. Haz clic en conectar para reintentar.'],
  ['Abra pelo aplicativo ALL MUSIC para conectar ao Spotify.', 'Open the ALL MUSIC app to connect to Spotify.', 'Abre la aplicación ALL MUSIC para conectar con Spotify.'],

  // barra de título e painéis
  ['Início', 'Home', 'Inicio'],
  ['Buscar no Spotify ou no YouTube', 'Search Spotify or YouTube', 'Buscar en Spotify o en YouTube'],
  ['Conta e configurações', 'Account and settings', 'Cuenta y ajustes'],
  ['Minimizar', 'Minimize', 'Minimizar'],
  ['Maximizar', 'Maximize', 'Maximizar'],
  ['Restaurar', 'Restore', 'Restaurar'],
  ['Fechar', 'Close', 'Cerrar'],
  ['Sua biblioteca', 'Your library', 'Tu biblioteca'],
  ['Minhas', 'Mine', 'Mías'],
  ['Nova playlist', 'New playlist', 'Nueva playlist'],
  ['Nome da playlist', 'Playlist name', 'Nombre de la playlist'],
  ['Recolher biblioteca', 'Collapse library', 'Contraer biblioteca'],
  ['Expandir biblioteca', 'Expand library', 'Expandir biblioteca'],
  ['Tocadas recentemente', 'Recently played', 'Escuchadas recientemente'],
  ['Recolher painel', 'Collapse panel', 'Contraer panel'],
  ['Expandir painel', 'Expand panel', 'Expandir panel'],
  ['O que você ouvir aparece aqui.', 'What you listen to shows up here.', 'Lo que escuches aparece aquí.'],
  ['Cancelar', 'Cancel', 'Cancelar'],
  ['Criar', 'Create', 'Crear'],

  // início
  ['Reproduções', 'Plays', 'Reproducciones'],
  ['Artistas', 'Artists', 'Artistas'],
  ['Tempo ouvido', 'Time listened', 'Tiempo escuchado'],
  ['{n} min', '{n} min', '{n} min'],
  ['{n} h', '{n} h', '{n} h'],
  ['ouvindo desde {date}', 'listening since {date}', 'escuchando desde {date}'],
  ['Faixa mais ouvida', 'Top track', 'Canción más escuchada'],
  ['Top artistas', 'Top artists', 'Artistas más escuchados'],
  ['Top faixas', 'Top tracks', 'Canciones más escuchadas'],
  ['7 dias', '7 days', '7 días'],
  ['30 dias', '30 days', '30 días'],
  ['Tudo', 'All time', 'Todo'],
  ['Ver todas', 'See all', 'Ver todas'],
  ['agora', 'now', 'ahora'],
  ['há {n} min', '{n} min ago', 'hace {n} min'],
  ['há {n} h', '{n} h ago', 'hace {n} h'],
  ['há {n} d', '{n} d ago', 'hace {n} d'],
  ['{n} reprodução', '{n} play', '{n} reproducción'],
  ['{n} reproduções', '{n} plays', '{n} reproducciones'],
  ['Nada neste período.', 'Nothing in this period.', 'Nada en este período.'],
  ['Ouça algumas músicas e esta tela se preenche com suas mais ouvidas, seus artistas e o tempo de escuta.',
    'Play a few songs and this screen fills in with your most played, your artists and your listening time.',
    'Escucha algunas canciones y esta pantalla se llena con tus más escuchadas, tus artistas y el tiempo de escucha.'],

  // biblioteca e listas
  ['Músicas curtidas', 'Liked songs', 'Canciones favoritas'],
  ['Todas', 'All', 'Todas'],
  ['Playlist · {n} música', 'Playlist · {n} song', 'Playlist · {n} canción'],
  ['Playlist · {n} músicas', 'Playlist · {n} songs', 'Playlist · {n} canciones'],
  ['Crie uma playlist para misturar Spotify e YouTube.', 'Create a playlist to mix Spotify and YouTube.', 'Crea una playlist para mezclar Spotify y YouTube.'],
  ['Nada por aqui.', 'Nothing here.', 'Nada por aquí.'],
  ['Fila', 'Queue', 'Cola'],
  ['Curtidas', 'Liked', 'Favoritos'],
  ['Mais ouvidas', 'Most played', 'Más escuchadas'],
  ['Todas as curtidas', 'All liked songs', 'Todos los favoritos'],
  ['Curtidas do Spotify', 'Liked on Spotify', 'Favoritos de Spotify'],
  ['Curtidas do YouTube', 'Liked on YouTube', 'Favoritos de YouTube'],
  ['Busca: {q}', 'Search: {q}', 'Búsqueda: {q}'],
  ['A fila está vazia. Toque qualquer música para começar.', 'The queue is empty. Play any song to start.', 'La cola está vacía. Reproduce cualquier canción para empezar.'],
  ['Cole um link do YouTube na busca lá em cima para adicionar uma música.', 'Paste a YouTube link in the search box above to add a song.', 'Pega un enlace de YouTube en la búsqueda de arriba para añadir una canción.'],
  ['Você ainda não curtiu nenhuma música.', 'You have not liked any songs yet.', 'Aún no has marcado ninguna canción.'],
  ['Conecte o Spotify pelo ícone de conta para ver suas curtidas.', 'Connect Spotify from the account icon to see your liked songs.', 'Conecta Spotify desde el icono de cuenta para ver tus favoritos.'],
  ['O que você ouvir no ALL MUSIC aparece aqui, com a contagem.', 'What you play in ALL MUSIC shows up here, with the count.', 'Lo que escuches en ALL MUSIC aparece aquí, con el conteo.'],
  ['Playlist vazia. Use o menu ⋮ de qualquer música para adicionar aqui.', 'Empty playlist. Use the ⋮ menu on any song to add it here.', 'Playlist vacía. Usa el menú ⋮ de cualquier canción para añadirla aquí.'],
  ['Playlist vazia.', 'Empty playlist.', 'Playlist vacía.'],
  ['Nenhum resultado.', 'No results.', 'Sin resultados.'],
  ['Buscando…', 'Searching…', 'Buscando…'],
  ['Ver todos os resultados', 'See all results', 'Ver todos los resultados'],
  ['Carregando…', 'Loading…', 'Cargando…'],
  ['Carregando mais…', 'Loading more…', 'Cargando más…'],
  ['Não deu para carregar. Tentar de novo', 'Could not load. Try again', 'No se pudo cargar. Reintentar'],
  ['Curtir', 'Like', 'Me gusta'],
  ['Remover das curtidas', 'Remove from liked', 'Quitar de favoritos'],
  ['Mais opções', 'More options', 'Más opciones'],
  ['Tocou {n} vez no ALL MUSIC', 'Played {n} time in ALL MUSIC', 'Sonó {n} vez en ALL MUSIC'],
  ['Tocou {n} vezes no ALL MUSIC', 'Played {n} times in ALL MUSIC', 'Sonó {n} veces en ALL MUSIC'],

  // menu da faixa
  ['Tocar a seguir', 'Play next', 'Reproducir a continuación'],
  ['Adicionar à fila', 'Add to queue', 'Añadir a la cola'],
  ['Adicionar a “{name}”', 'Add to “{name}”', 'Añadir a “{name}”'],
  ['Adicionar a uma nova playlist…', 'Add to a new playlist…', 'Añadir a una nueva playlist…'],
  ['Remover desta lista', 'Remove from this list', 'Quitar de esta lista'],
  ['Abrir no YouTube', 'Open on YouTube', 'Abrir en YouTube'],
  ['Abrir no Spotify', 'Open on Spotify', 'Abrir en Spotify'],

  // avisos
  ['Já está nessa playlist', 'Already in that playlist', 'Ya está en esa playlist'],
  ['Adicionada a “{name}”', 'Added to “{name}”', 'Añadida a “{name}”'],
  ['Essa é a música que está tocando', 'That is the song playing now', 'Esa es la canción que está sonando'],
  ['Link não reconhecido. Cole um link de vídeo do YouTube.', 'Link not recognized. Paste a YouTube video link.', 'Enlace no reconocido. Pega un enlace de video de YouTube.'],
  ['Sem Spotify, a busca só aceita links do YouTube', 'Without Spotify, search only accepts YouTube links', 'Sin Spotify, la búsqueda solo acepta enlaces de YouTube'],
  ['Spotify desconectado', 'Spotify disconnected', 'Spotify desconectado'],
  ['O Spotify não respondeu', 'Spotify did not respond', 'Spotify no respondió'],
  ['O Spotify reconectou, tente de novo', 'Spotify reconnected, try again', 'Spotify se reconectó, inténtalo de nuevo'],
  ['Esta faixa não está disponível no Spotify', 'This track is not available on Spotify', 'Esta canción no está disponible en Spotify'],
  ['Vídeo do YouTube', 'YouTube video', 'Video de YouTube'],
  ['Este vídeo não permite tocar fora do YouTube', 'This video cannot be played outside YouTube', 'Este video no permite reproducirse fuera de YouTube'],
  ['Vídeo não encontrado', 'Video not found', 'Video no encontrado'],
  ['Não deu para carregar o player do YouTube', 'Could not load the YouTube player', 'No se pudo cargar el reproductor de YouTube'],
  ['O dono deste vídeo bloqueou a reprodução fora do YouTube', 'The owner of this video blocked playback outside YouTube', 'El dueño de este video bloqueó la reproducción fuera de YouTube'],
  ['Vídeo removido ou privado', 'Video removed or private', 'Video eliminado o privado'],
  ['Erro ao tocar o vídeo do YouTube', 'Error playing the YouTube video', 'Error al reproducir el video de YouTube'],

  // player
  ['Nada tocando', 'Nothing playing', 'Nada sonando'],
  ['Aleatório', 'Shuffle', 'Aleatorio'],
  ['Anterior', 'Previous', 'Anterior'],
  ['Tocar / pausar', 'Play / pause', 'Reproducir / pausar'],
  ['Próxima', 'Next', 'Siguiente'],
  ['Repetir fila', 'Repeat queue', 'Repetir cola'],
  ['Posição', 'Position', 'Posición'],

  // configurações
  ['Conta', 'Account', 'Cuenta'],
  ['Conta conectada', 'Connected account', 'Cuenta conectada'],
  ['Sair', 'Sign out', 'Cerrar sesión'],
  ['Sem Spotify', 'No Spotify', 'Sin Spotify'],
  ['Só músicas do YouTube', 'YouTube songs only', 'Solo canciones de YouTube'],
  ['Conectar', 'Connect', 'Conectar'],
  ['Idioma', 'Language', 'Idioma'],
  ['Desempenho', 'Performance', 'Rendimiento'],
  ['Minimizar a janela manda o ALL MUSIC para a bandeja e libera memória; a música continua.',
    'Minimizing the window sends ALL MUSIC to the tray and frees memory; the music keeps playing.',
    'Minimizar la ventana envía ALL MUSIC a la bandeja y libera memoria; la música continúa.'],

  // busca nas duas fontes, artistas, álbuns e efeitos
  ['YouTube: {q}', 'YouTube: {q}', 'YouTube: {q}'],
  ['Conecte o Spotify pelo ícone de conta para buscar nele.', 'Connect Spotify from the account icon to search it.', 'Conecta Spotify desde el icono de cuenta para buscar en él.'],
  ['Conecte o Spotify pelo ícone de conta para ver artistas e álbuns.', 'Connect Spotify from the account icon to see artists and albums.', 'Conecta Spotify desde el icono de cuenta para ver artistas y álbumes.'],
  ['A busca do YouTube não respondeu', 'YouTube search did not respond', 'La búsqueda de YouTube no respondió'],
  ['Artista', 'Artist', 'Artista'],
  ['Álbum', 'Album', 'Álbum'],
  ['Populares', 'Popular', 'Populares'],
  ['Discografia', 'Discography', 'Discografía'],
  ['Tocar', 'Play', 'Reproducir'],
  ['Nenhuma faixa popular disponível.', 'No popular tracks available.', 'No hay canciones populares disponibles.'],
  ['Álbum vazio.', 'Empty album.', 'Álbum vacío.'],
  ['Ir para o artista', 'Go to artist', 'Ir al artista'],
  ['Ir para o álbum', 'Go to album', 'Ir al álbum'],
  ['Efeitos de áudio', 'Audio effects', 'Efectos de audio'],
  ['Sem efeito', 'No effect', 'Sin efecto'],
  ['Abafado', 'Muffled', 'Amortiguado'],
  ['Áudio 8D', '8D audio', 'Audio 8D'],
  ['Som original', 'Original sound', 'Sonido original'],
  ['Como no cômodo ao lado', 'Like in the next room', 'Como en la habitación de al lado'],
  ['Gira ao seu redor · use fones', 'Spins around you · use headphones', 'Gira a tu alrededor · usa auriculares'],
  ['Ajustar efeito', 'Adjust effect', 'Ajustar efecto'],
  ['Abafamento', 'Muffling', 'Amortiguación'],
  ['Graves', 'Bass', 'Graves'],
  ['Cômodo ao lado', 'Next room', 'Habitación de al lado'],
  ['Suave', 'Soft', 'Suave'],
  ['Voz em destaque', 'Vocals forward', 'Voz destacada'],
  ['Debaixo d’água', 'Underwater', 'Bajo el agua'],
  ['Clássico', 'Classic', 'Clásico'],
  ['Órbita lenta', 'Slow orbit', 'Órbita lenta'],
  ['Rápido', 'Fast', 'Rápido'],
  ['Pingue-pongue', 'Ping-pong', 'Ping-pong'],
  ['Sala ampla', 'Big room', 'Sala amplia'],
  ['Volume', 'Volume', 'Volumen'],
  ['Velocidade', 'Speed', 'Velocidad'],
  ['Abertura', 'Width', 'Amplitud'],
  ['Eco', 'Echo', 'Eco'],
  ['Restaurar padrão', 'Reset to default', 'Restablecer'],
  ['Voltar', 'Back', 'Volver'],
];

// O padrão é inglês; os outros idiomas só valem quando a pessoa escolhe nas configurações.
const saved = store.get('lang');
export const lang = saved in LANGUAGES ? saved : 'en';

const column = { pt: 0, en: 1, es: 2 }[lang];
const dict = new Map(ROWS.map(row => [row[0], row[column]]));

/** Traduz um texto em português; `vars` preenche marcadores como {name}. */
export function t(text, vars) {
  let out = dict.get(text) ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, value);
  return out;
}

/** Variante com plural: escolhe a chave pelo número e preenche {n}. */
export const tn = (n, one, many) => t(n === 1 ? one : many, { n });

/** Traduz os textos fixos do HTML (nós de texto e title/placeholder/aria-label). */
export function translateDom(root = document.body) {
  document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es' }[lang];
  if (lang === 'pt') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    const key = node.nodeValue.trim();
    if (key && dict.has(key)) node.nodeValue = node.nodeValue.replace(key, dict.get(key));
  }
  for (const el of root.querySelectorAll('[title], [placeholder], [aria-label]')) {
    for (const name of ['title', 'placeholder', 'aria-label']) {
      const value = el.getAttribute(name);
      if (value && dict.has(value)) el.setAttribute(name, dict.get(value));
    }
  }
}

export function setLanguage(next) {
  store.set('lang', next);
  location.reload();
}
