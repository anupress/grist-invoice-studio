# Dependency-free static file server for local preview (no Node/Python needed).
# Concurrent: each connection is handled in a runspace, with socket timeouts, so a single
# idle/preconnect socket can never wedge the accept loop.
# Default web root = the project root (parent of /scripts).
param(
  # -Port wins; otherwise the PORT env var (set by preview tooling that assigns a free port); otherwise 4178.
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 4178 }),
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "ANUPRESS static server: http://127.0.0.1:$Port/  (root: $Root)"

$handler = {
  param($client, $Root)
  $mime = @{
    '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
    '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
    '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'
    '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
    '.gif'='image/gif'; '.ico'='image/x-icon'; '.csv'='text/csv; charset=utf-8'
    '.woff'='font/woff'; '.woff2'='font/woff2'; '.map'='application/json'
    '.pdf'='application/pdf'
  }
  try {
    $client.ReceiveTimeout = 5000; $client.SendTimeout = 5000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { return }
    $parts = $requestLine.Split(' ')
    if ($parts.Length -ge 2) { $rawPath = $parts[1] } else { $rawPath = '/' }
    $rawPath = $rawPath.Split('?')[0]
    $rel = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $rel = $rel -replace '\.\.', ''
    $path = Join-Path $Root $rel
    if (Test-Path -LiteralPath $path -PathType Container) { $path = Join-Path $path 'index.html' }
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
    } else {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    }
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } catch { } finally { try { $client.Close() } catch { } }
}

$pool = [runspacefactory]::CreateRunspacePool(1, 12)
$pool.Open()

while ($true) {
  try {
    $client = $listener.AcceptTcpClient()
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($handler).AddArgument($client).AddArgument($Root)
    [void]$ps.BeginInvoke()
  } catch { }
}
