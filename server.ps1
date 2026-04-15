$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
try {
    $listener.Start()
    Write-Host "Server started on http://localhost:8000/"
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath.TrimStart('/')
        if ($path -eq "") { $path = "index.html" }
        $fullPath = Join-Path $pwd $path
        
        if (Test-Path $fullPath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($fullPath)
            $contentType = switch ($extension) {
                ".html" { "text/html" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                default { "application/octet-stream" }
            }
            $response.ContentType = $contentType
            $content = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
