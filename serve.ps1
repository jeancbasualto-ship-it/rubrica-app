# serve.ps1 - intenta levantar un servidor estático en el puerto 8000
# Uso: Ejecuta desde la carpeta del proyecto: .\serve.ps1

$port = 8000
Write-Host "Intentando iniciar servidor estático en http://localhost:$port"

# Intentar con Python 3
try {
    & python -m http.server $port
} catch {
    Write-Host "Python no disponible o falló. Intentando npx http-server..."
    try {
        npx http-server -p $port
    } catch {
        Write-Host "No se pudo iniciar servidor. Asegúrate de tener Python 3 o Node.js (npx)." -ForegroundColor Red
    }
}
