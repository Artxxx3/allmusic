using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AllMusic;

sealed class MainForm : Form
{
    const int WM_HOTKEY = 0x0312;
    const int WM_NCCALCSIZE = 0x0083;
    const int WM_NCHITTEST = 0x0084;
    const int HTCLIENT = 1, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14;

    // Faixa no topo, fora do WebView2, que serve só para redimensionar a janela por cima.
    const int TopGrip = 4;

    // Teclas de mídia do teclado, registradas globalmente para funcionar com um jogo em foco.
    static readonly (int Id, uint Vk, string Action)[] MediaKeys =
    [
        (1, 0xB3, "toggle"),
        (2, 0xB0, "next"),
        (3, 0xB1, "prev"),
        (4, 0xB2, "pause"),
    ];

    // Textos do menu da bandeja por idioma (o idioma é o escolhido na interface).
    static readonly Dictionary<string, string[]> TrayText = new()
    {
        ["pt"] = ["Abrir", "Tocar / pausar", "Próxima", "Sair"],
        ["en"] = ["Open", "Play / pause", "Next", "Quit"],
        ["es"] = ["Abrir", "Reproducir / pausar", "Siguiente", "Salir"],
    };

    static readonly Color Background = Color.FromArgb(0x0B, 0x0B, 0x0C);

    readonly LocalServer _server;
    readonly bool _dev;
    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Background };
    readonly NotifyIcon _tray;

    // Motor de Spotify (engine/): processo à parte que fala por linhas JSON no stdin/stdout.
    Process? _engine;
    string _engineStatus = "";
    string _lang = "en";
    int _engineRestarts;                         // reinícios automáticos desde o último "pronto"
    readonly Queue<string> _engineErrors = new(); // últimas linhas de erro do motor, para o diagnóstico

    public MainForm(LocalServer server, bool dev)
    {
        _server = server;
        _dev = dev;

        Text = "ALL MUSIC";
        BackColor = Background;
        ClientSize = new Size(1280, 800);
        MinimumSize = new Size(980, 640);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = new Icon(typeof(MainForm).Assembly.GetManifestResourceStream("AllMusic.app.ico")!);
        Controls.Add(_web);

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open", null, (_, _) => Reveal());
        menu.Items.Add("Play / pause", null, (_, _) => Send("media", "toggle"));
        menu.Items.Add("Next", null, (_, _) => Send("media", "next"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => Close());
        _tray = new NotifyIcon { Icon = Icon, Text = "ALL MUSIC", ContextMenuStrip = menu, Visible = true };
        _tray.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) Reveal(); };

        _server.ShowRequested += () => BeginInvoke(Reveal);

        Load += async (_, _) => await InitWebView();
    }

    async Task InitWebView()
    {
        try
        {
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ALL MUSIC");
            // Autoplay liberado para trocar de faixa sem clique; as teclas de mídia ficam com o host (WM_HOTKEY),
            // senão o Chromium e o host responderiam à mesma tecla.
            var flags = "--autoplay-policy=no-user-gesture-required --disable-features=HardwareMediaKeyHandling";
            // Só com --dev: porta de depuração local, usada para automatizar a interface (testes e gravação de vídeo).
            if (_dev) flags += " --remote-debugging-port=9333";
            var options = new CoreWebView2EnvironmentOptions(flags);
            var env = await CoreWebView2Environment.CreateAsync(null, data, options);
            await _web.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show("The WebView2 Runtime could not be started.\n\n" + ex.Message, "ALL MUSIC");
            Close();
            return;
        }

        var core = _web.CoreWebView2;
        var s = core.Settings;
        s.AreDevToolsEnabled = _dev;
        s.AreBrowserAcceleratorKeysEnabled = _dev;
        s.AreDefaultContextMenusEnabled = _dev;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        // Deixa a página marcar a área de arrastar a janela com CSS (app-region: drag).
        s.IsNonClientRegionSupportEnabled = true;

        // A janela só mostra o próprio app; qualquer link externo vai para o navegador padrão.
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        };
        core.NavigationStarting += (_, e) =>
        {
            if (e.Uri.StartsWith(LocalServer.Origin + "/", StringComparison.Ordinal)) return;
            e.Cancel = true;
            OpenExternal(e.Uri);
        };
        // Efeitos de áudio nas faixas do YouTube: o script roda em todos os frames, mas só age dentro
        // do iframe do player (ver ui/js/yt-fx.js), onde a página do app não alcança.
        var assembly = typeof(MainForm).Assembly;
        var fxScript = assembly.GetManifestResourceNames().First(name => name.EndsWith("yt-fx.js", StringComparison.Ordinal));
        using (var reader = new StreamReader(assembly.GetManifestResourceStream(fxScript)!))
            await core.AddScriptToExecuteOnDocumentCreatedAsync(await reader.ReadToEndAsync());

        core.WebMessageReceived += OnWebMessage;
        core.NavigationCompleted += (_, _) => SendWindowState();
        core.Navigate(LocalServer.Origin + "/");
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(LocalServer.Origin + "/", StringComparison.Ordinal)) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var msg = doc.RootElement;
            var value = msg.TryGetProperty("value", out var v) ? v.GetString() ?? "" : "";
            switch (msg.GetProperty("type").GetString())
            {
                case "lang" when TrayText.TryGetValue(value, out var labels):
                    _lang = value;
                    var items = _tray.ContextMenuStrip!.Items;
                    (items[0].Text, items[1].Text, items[2].Text, items[4].Text) = (labels[0], labels[1], labels[2], labels[3]);
                    break;
                case "engine-start":
                    StartEngine();
                    break;
                case "engine-restart":
                    // pedido explícito de quem viu o aviso de motor parado
                    _engineRestarts = 0;
                    StartEngine();
                    break;
                case "engine" when !value.Contains('\n'):
                    try
                    {
                        _engine?.StandardInput.WriteLine(value);
                        _engine?.StandardInput.Flush();
                    }
                    catch { }
                    break;
                case "win":
                    if (value == "min") WindowState = FormWindowState.Minimized;
                    else if (value == "max") WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                    else if (value == "close") Close();
                    break;
                case "open":
                    OpenExternal(value);
                    break;
                case "now":
                    var text = value.Length == 0 ? "ALL MUSIC" : value;
                    _tray.Text = text.Length > 63 ? text[..63] : text;
                    Text = value.Length == 0 ? "ALL MUSIC" : value + " — ALL MUSIC";
                    break;
            }
        }
        catch { }
    }

    static readonly string DataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "allmusic");

    void StartEngine()
    {
        if (_engine is { HasExited: false })
        {
            // A página recarregou com o motor já rodando: repete o último estado de login.
            if (_engineStatus.Length > 0) Send("engine", _engineStatus);
            return;
        }

        try
        {
            var exe = ExtractEngine();
            var start = new ProcessStartInfo(exe)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardInputEncoding = new UTF8Encoding(false),
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            start.Environment["ALLMUSIC_LANG"] = _lang; // idioma da página "pode fechar esta aba"
            var engine = Process.Start(start)!;
            engine.EnableRaisingEvents = true;
            engine.OutputDataReceived += (_, e) =>
            {
                if (e.Data is not { Length: > 0 } line) return;
                // Só linhas JSON são eventos; o resto é ruído de bibliotecas. A exceção é o endereço
                // do login, que a biblioteca escreve em texto puro.
                if (line[0] == '{') OnUi(() => EngineEvent(line));
                else if (line.StartsWith("Browse to: ", StringComparison.Ordinal))
                    OnUi(() => EngineEvent(JsonSerializer.Serialize(new { ev = "login_url", url = line[11..].Trim() })));
            };
            engine.ErrorDataReceived += (_, e) =>
            {
                if (e.Data is { Length: > 0 } line) OnUi(() => LogEngine(line));
            };
            engine.Exited += (_, _) =>
            {
                var code = 0;
                try { code = engine.ExitCode; } catch { }
                OnUi(() => EngineExited(engine, code));
            };
            engine.BeginOutputReadLine();
            engine.BeginErrorReadLine();
            _engine = engine;
            LogEngine("started " + exe);
        }
        catch (Exception ex)
        {
            LogEngine("could not start: " + ex.Message);
            EngineGone("could not start: " + ex.Message);
        }
    }

    void EngineExited(Process engine, int code)
    {
        if (!ReferenceEquals(engine, _engine)) return;
        LogEngine($"exited with code {code}");
        // Uma queda isolada se resolve reiniciando; se repetir, avisa a interface com o motivo.
        if (_engineRestarts++ < 2)
        {
            StartEngine();
            return;
        }
        var last = _engineErrors.LastOrDefault(l => !l.StartsWith("started ", StringComparison.Ordinal) && !l.StartsWith("exited ", StringComparison.Ordinal));
        EngineGone(last is null ? $"exit code {code}" : $"exit code {code}: {last}");
    }

    void EngineGone(string reason) =>
        EngineEvent(JsonSerializer.Serialize(new { ev = "gone", msg = reason.Length > 300 ? reason[..300] : reason }));

    /// <summary>Guarda as últimas linhas de erro e grava tudo em engine.log, na pasta de dados.</summary>
    void LogEngine(string line)
    {
        _engineErrors.Enqueue(line);
        while (_engineErrors.Count > 30) _engineErrors.Dequeue();
        try
        {
            Directory.CreateDirectory(DataDir);
            var log = Path.Combine(DataDir, "engine.log");
            if (File.Exists(log) && new FileInfo(log).Length > 200_000) File.Delete(log);
            File.AppendAllText(log, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}{Environment.NewLine}");
        }
        catch { }
    }

    /// <summary>
    /// O motor viaja dentro do .exe; para rodar, é gravado em disco. O nome leva o tamanho do
    /// arquivo, então uma versão nova nunca precisa sobrescrever uma antiga que esteja em uso.
    /// </summary>
    static string ExtractEngine()
    {
        using var resource = typeof(MainForm).Assembly.GetManifestResourceStream("allmusic-engine.exe")!;
        var name = $"allmusic-engine-{resource.Length}.exe";
        Exception? failure = null;
        // Pasta de dados primeiro; se ela estiver bloqueada (antivírus, permissões), a temporária.
        foreach (var dir in new[] { Path.Combine(DataDir, "bin"), Path.Combine(Path.GetTempPath(), "allmusic") })
        {
            try
            {
                var exe = Path.Combine(dir, name);
                if (File.Exists(exe) && new FileInfo(exe).Length == resource.Length) return exe;
                Directory.CreateDirectory(dir);
                // limpa versões antigas que não estejam em uso
                foreach (var old in Directory.GetFiles(dir, "allmusic-engine*.exe"))
                    try { File.Delete(old); } catch { }
                resource.Position = 0;
                using (var file = File.Create(exe)) resource.CopyTo(file);
                return exe;
            }
            catch (Exception ex)
            {
                failure = ex;
            }
        }
        throw failure ?? new IOException("engine extraction failed");
    }

    void EngineEvent(string line)
    {
        if (line.StartsWith("{\"ev\":\"ready\"", StringComparison.Ordinal) ||
            line.StartsWith("{\"ev\":\"need_login\"", StringComparison.Ordinal) ||
            line.StartsWith("{\"ev\":\"gone\"", StringComparison.Ordinal))
        {
            if (line.StartsWith("{\"ev\":\"ready\"", StringComparison.Ordinal)) _engineRestarts = 0;
            // Depois do login no navegador, traz a janela de volta para a frente.
            if (_engineStatus.StartsWith("{\"ev\":\"need_login\"", StringComparison.Ordinal) &&
                line.StartsWith("{\"ev\":\"ready\"", StringComparison.Ordinal)) Reveal();
            _engineStatus = line;
        }
        Send("engine", line);
    }

    void OnUi(Action action)
    {
        try
        {
            if (IsHandleCreated && !IsDisposed) BeginInvoke(action);
        }
        catch { }
    }

    static void OpenExternal(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) return;
        try { Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }

    void Send(string type, string value)
    {
        if (_web.CoreWebView2 is { } core)
            core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type, value }));
    }

    void Reveal()
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
        SetMemoryTarget(CoreWebView2MemoryUsageTargetLevel.Normal);
    }

    void SetMemoryTarget(CoreWebView2MemoryUsageTargetLevel level)
    {
        try
        {
            if (_web.CoreWebView2 is { } core) core.MemoryUsageTargetLevel = level;
        }
        catch { }
    }

    void SendWindowState() => Send("window", WindowState == FormWindowState.Maximized ? "max" : "normal");

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        // Maximizada não redimensiona, então a faixa do topo some.
        Padding = new Padding(0, WindowState == FormWindowState.Maximized ? 0 : TopGrip * DeviceDpi / 96, 0, 0);
        SendWindowState();
        if (WindowState != FormWindowState.Minimized) return;
        // Minimizar manda para a bandeja e pede ao WebView2 para soltar memória; o áudio continua.
        Hide();
        SetMemoryTarget(CoreWebView2MemoryUsageTargetLevel.Low);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var on = 1;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        // Refaz a moldura já sem a barra de título (ver WM_NCCALCSIZE).
        SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020 /* NOSIZE|NOMOVE|NOZORDER|NOACTIVATE|FRAMECHANGED */);
        foreach (var k in MediaKeys) RegisterHotKey(Handle, k.Id, 0, k.Vk);
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        foreach (var k in MediaKeys) UnregisterHotKey(Handle, k.Id);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY)
        {
            var id = (int)m.WParam;
            foreach (var k in MediaKeys)
                if (k.Id == id) Send("media", k.Action);
        }

        // Sem barra de título do Windows: a área do cliente sobe até o topo, mas a moldura
        // lateral/inferior continua a do sistema (redimensionar, sombra, encaixe nas bordas).
        if (m.Msg == WM_NCCALCSIZE && m.WParam != IntPtr.Zero)
        {
            var top = Marshal.ReadInt32(m.LParam, 4);
            base.WndProc(ref m);
            // Maximizada, a janela passa da tela pela espessura da moldura; compensa para não cortar o topo.
            var frame = IsZoomed(Handle)
                ? GetSystemMetricsForDpi(33 /* SM_CYSIZEFRAME */, (uint)DeviceDpi) + GetSystemMetricsForDpi(92 /* SM_CXPADDEDBORDER */, (uint)DeviceDpi)
                : 0;
            Marshal.WriteInt32(m.LParam, 4, top + frame);
            m.Result = IntPtr.Zero;
            return;
        }

        base.WndProc(ref m);

        if (m.Msg == WM_NCHITTEST && (int)m.Result == HTCLIENT && Padding.Top > 0)
        {
            var p = PointToClient(new Point(unchecked((short)(long)m.LParam), unchecked((short)((long)m.LParam >> 16))));
            if (p.Y < Padding.Top)
            {
                var corner = 16 * DeviceDpi / 96;
                m.Result = p.X < corner ? HTTOPLEFT : p.X >= ClientSize.Width - corner ? HTTOPRIGHT : HTTOP;
            }
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _tray.Visible = false;
        _tray.Dispose();
        try
        {
            if (_engine is { HasExited: false } engine) engine.Kill();
        }
        catch { }
        base.OnFormClosed(e);
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern int GetSystemMetricsForDpi(int index, uint dpi);

    [DllImport("user32.dll")]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
