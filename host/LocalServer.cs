using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AllMusic;

/// <summary>
/// Servidor mínimo, só em 127.0.0.1. Existe porque o player do YouTube precisa de uma
/// origem http(s) real para a página.
/// </summary>
sealed partial class LocalServer : IDisposable
{
    public const int Port = 38417;
    public static readonly string Origin = $"http://127.0.0.1:{Port}";

    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };
    static readonly Dictionary<string, string> Mime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".ico"] = "image/x-icon",
        [".woff2"] = "font/woff2",
    };

    readonly HttpListener _listener = new();

    // Arquivos da interface, embutidos no .exe: caminho da URL -> nome do recurso.
    static readonly Dictionary<string, string> Files = typeof(LocalServer).Assembly.GetManifestResourceNames()
        .Where(name => name.StartsWith("ui/", StringComparison.Ordinal))
        .ToDictionary(name => name[2..].Replace('\\', '/'), name => name, StringComparer.OrdinalIgnoreCase);

    public event Action? ShowRequested;

    [GeneratedRegex(@"^[\w-]{11}$")]
    private static partial Regex VideoId();

    public void Start()
    {
        _listener.Prefixes.Add(Origin + "/");
        _listener.Start();
        _ = Task.Run(Loop);
    }

    async Task Loop()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch { break; }
            _ = Task.Run(() => Handle(ctx));
        }
    }

    async Task Handle(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var res = ctx.Response;
        try
        {
            // Bloqueia DNS rebinding: só atende quando o Host é o próprio loopback.
            if (req.UserHostName != $"127.0.0.1:{Port}" || req.HttpMethod != "GET")
            {
                res.StatusCode = 403;
                return;
            }

            var path = req.Url!.AbsolutePath;
            switch (path)
            {
                case "/api/show":
                    ShowRequested?.Invoke();
                    res.StatusCode = 204;
                    return;

                case "/api/oembed":
                    await Oembed(req.QueryString["id"] ?? "", res);
                    return;

                case "/api/ytsearch":
                    await YouTubeSearch(req.QueryString["q"] ?? "", res);
                    return;

                case "/":
                    path = "/index.html";
                    break;
            }

            if (!Files.TryGetValue(Uri.UnescapeDataString(path), out var resource))
            {
                res.StatusCode = 404;
                return;
            }

            using var stream = typeof(LocalServer).Assembly.GetManifestResourceStream(resource)!;
            var body = new byte[stream.Length];
            stream.ReadExactly(body);
            res.Headers["Cache-Control"] = "no-cache";
            await Write(res, Mime.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream"), body);
        }
        catch
        {
            try { res.StatusCode = 500; } catch { }
        }
        finally
        {
            try { res.Close(); } catch { }
        }
    }

    /// <summary>Título/autor de um vídeo. O oEmbed do YouTube não manda CORS, então passa por aqui.</summary>
    /// <summary>
    /// Busca de vídeos no YouTube. Não existe API pública sem chave, então lê a própria página de
    /// resultados (os dados vêm num bloco JSON embutido nela). Devolve [{ id, title, channel, seconds }].
    /// </summary>
    static async Task YouTubeSearch(string query, HttpListenerResponse res)
    {
        query = query.Trim();
        if (query.Length is 0 or > 200)
        {
            res.StatusCode = 400;
            return;
        }

        try
        {
            // sp=EgIQAQ== filtra só vídeos (sem canais, playlists e shorts em carrossel)
            using var request = new HttpRequestMessage(HttpMethod.Get,
                "https://www.youtube.com/results?hl=en&sp=EgIQAQ%3D%3D&search_query=" + Uri.EscapeDataString(query));
            request.Headers.TryAddWithoutValidation("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36");
            request.Headers.TryAddWithoutValidation("Accept-Language", "en");
            request.Headers.TryAddWithoutValidation("Cookie", "SOCS=CAI; CONSENT=YES+1"); // pula a tela de consentimento
            using var response = await Http.SendAsync(request);
            var html = await response.Content.ReadAsStringAsync();

            const string marker = "var ytInitialData = ";
            var start = html.IndexOf(marker, StringComparison.Ordinal);
            var end = start < 0 ? -1 : html.IndexOf(";</script>", start, StringComparison.Ordinal);
            if (end < 0)
            {
                res.StatusCode = 502;
                return;
            }

            using var data = JsonDocument.Parse(html.AsMemory(start + marker.Length, end - start - marker.Length));
            var results = new List<object>();
            if (TryPath(data.RootElement, out var sections, "contents", "twoColumnSearchResultsRenderer", "primaryContents", "sectionListRenderer", "contents"))
            {
                foreach (var section in sections.EnumerateArray())
                {
                    if (!TryPath(section, out var items, "itemSectionRenderer", "contents")) continue;
                    foreach (var item in items.EnumerateArray())
                    {
                        if (!item.TryGetProperty("videoRenderer", out var video)) continue;
                        // sem duração = transmissão ao vivo; não serve como faixa
                        if (!TryPath(video, out var length, "lengthText", "simpleText")) continue;
                        if (!video.TryGetProperty("videoId", out var id) || !VideoId().IsMatch(id.GetString() ?? "")) continue;
                        results.Add(new
                        {
                            id = id.GetString(),
                            title = FirstRun(video, "title"),
                            channel = FirstRun(video, "ownerText"),
                            seconds = ParseDuration(length.GetString() ?? ""),
                        });
                        if (results.Count == 20) break;
                    }
                }
            }

            await Write(res, "application/json; charset=utf-8", JsonSerializer.SerializeToUtf8Bytes(results));
        }
        catch
        {
            res.StatusCode = 502;
        }
    }

    static bool TryPath(JsonElement element, out JsonElement found, params string[] path)
    {
        found = element;
        foreach (var key in path)
        {
            if (found.ValueKind != JsonValueKind.Object || !found.TryGetProperty(key, out found)) return false;
        }
        return true;
    }

    static string FirstRun(JsonElement video, string property) =>
        TryPath(video, out var runs, property, "runs") && runs.GetArrayLength() > 0 && runs[0].TryGetProperty("text", out var text)
            ? text.GetString() ?? ""
            : "";

    /// <summary>"3:45" ou "1:02:03" em segundos.</summary>
    static int ParseDuration(string text)
    {
        var total = 0;
        foreach (var part in text.Split(':'))
        {
            if (!int.TryParse(part, out var value)) return 0;
            total = total * 60 + value;
        }
        return total;
    }

    static async Task Oembed(string id, HttpListenerResponse res)
    {
        if (!VideoId().IsMatch(id))
        {
            res.StatusCode = 400;
            return;
        }

        var url = "https://www.youtube.com/oembed?format=json&url=" +
                  Uri.EscapeDataString("https://www.youtube.com/watch?v=" + id);
        try
        {
            using var r = await Http.GetAsync(url);
            res.StatusCode = (int)r.StatusCode;
            if (r.IsSuccessStatusCode)
                await Write(res, "application/json; charset=utf-8", await r.Content.ReadAsByteArrayAsync());
        }
        catch
        {
            res.StatusCode = 502;
        }
    }

    static async Task Write(HttpListenerResponse res, string type, byte[] body)
    {
        res.ContentType = type;
        res.ContentLength64 = body.Length;
        await res.OutputStream.WriteAsync(body);
    }

    public void Dispose()
    {
        try { _listener.Close(); } catch { }
    }
}
