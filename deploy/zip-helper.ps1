<#
  Zips a folder with forward slashes in entry names.
  Compress-Archive in Windows PowerShell 5.1 writes backslashes, which a Linux server extracts as
  files literally named "public\index.php" instead of folders. Hidden files (.htaccess) and empty
  folders (storage\logs) are included.
#>
function New-LinuxZip {
    param([Parameter(Mandatory)][string]$SourceDir, [Parameter(Mandatory)][string]$ZipPath)

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $SourceDir = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

    $zip = [IO.Compression.ZipFile]::Open($ZipPath, [IO.Compression.ZipArchiveMode]::Create)
    try {
        Get-ChildItem -LiteralPath $SourceDir -Recurse -Force | ForEach-Object {
            $name = $_.FullName.Substring($SourceDir.Length + 1).Replace('\', '/')
            if ($_.PSIsContainer) {
                if (-not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1)) { [void]$zip.CreateEntry($name + '/') }
            } else {
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)
            }
        }
    } finally {
        $zip.Dispose()
    }
}
