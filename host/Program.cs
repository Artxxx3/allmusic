namespace AllMusic;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "allmusic.single-instance", out var first);
        if (!first)
        {
            // Já está aberto: só pede para a instância existente aparecer.
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                http.GetAsync(LocalServer.Origin + "/api/show").Wait();
            }
            catch { }
            return;
        }

        using var server = new LocalServer();
        try
        {
            server.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not open port {LocalServer.Port}.\n\n{ex.Message}", "ALL MUSIC");
            return;
        }

        if (args.Contains("--server-only"))
        {
            Thread.Sleep(Timeout.Infinite);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(server, args.Contains("--dev")));
    }
}
