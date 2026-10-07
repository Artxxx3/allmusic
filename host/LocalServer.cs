using System.Net;
using System.Text;
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
