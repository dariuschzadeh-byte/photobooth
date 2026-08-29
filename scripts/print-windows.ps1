# =====================================================================
#  Print one image straight to a Windows printer, bypassing Hot Folder
#  Print entirely.
#
#  Written because HFP stopped working and takes the booth down with it,
#  while Windows itself reports the printer as ready. The booth does not
#  actually need HFP -- it needs the sheet on paper, and Windows can do
#  that on its own.
#
#  Prints edge to edge with no margins: the strip is already built at the
#  exact sheet size, so anything Windows adds would shift the cut.
#
#  Usage:
#    powershell -File print-windows.ps1 -Image <file> [-Printer <name>]
#                                       [-PaperSize <name>] [-ListSizes]
# =====================================================================
param(
  [string]$Image,
  [string]$Printer = "DS-RX1",
  [string]$PaperSize = "",
  [switch]$ListSizes
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Find-Printer([string]$want) {
  $all = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
  foreach ($p in $all) { if ($p -eq $want) { return $p } }
  foreach ($p in $all) { if ($p -like "*$want*") { return $p } }
  return $null
}

$name = Find-Printer $Printer
if (-not $name) {
  Write-Host "  Printer '$Printer' not found. Installed printers:"
  foreach ($p in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) { Write-Host "     $p" }
  exit 1
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $name

if ($ListSizes) {
  Write-Host "  Paper sizes offered by '$name':"
  Write-Host ""
  foreach ($s in $doc.PrinterSettings.PaperSizes) {
    $w = [math]::Round($s.Width / 100, 2)
    $h = [math]::Round($s.Height / 100, 2)
    Write-Host ("     {0,-38} {1} x {2} inch" -f $s.PaperName, $w, $h)
  }
  Write-Host ""
  Write-Host "  The booth builds a 4 x 6 inch sheet holding two 2 x 6 strips,"
  Write-Host "  so pick the 4x6 (or 6x4) size whose name mentions a 2 inch cut."
  exit 0
}

if (-not $Image) { Write-Host "  No -Image given."; exit 1 }
if (-not (Test-Path -LiteralPath $Image)) { Write-Host "  File not found: $Image"; exit 1 }

if ($PaperSize -ne "") {
  $picked = $null
  foreach ($s in $doc.PrinterSettings.PaperSizes) {
    if ($s.PaperName -eq $PaperSize) { $picked = $s; break }
  }
  if (-not $picked) {
    foreach ($s in $doc.PrinterSettings.PaperSizes) {
      if ($s.PaperName -like "*$PaperSize*") { $picked = $s; break }
    }
  }
  if (-not $picked) { Write-Host "  Paper size '$PaperSize' not offered. Use -ListSizes to see the names."; exit 1 }
  $doc.DefaultPageSettings.PaperSize = $picked
  Write-Host "  Paper size: $($picked.PaperName)"
}

# No margins. The strip is already the exact sheet, and a margin would
# move the image relative to the printer's cut.
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false
$doc.DocumentName = "fr-anz photobooth strip"

$img = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Image).Path)

$handler = {
  param($sender, $e)
  # Fill the whole printable sheet. The image was built at the sheet's
  # own aspect ratio, so this does not distort it.
  $e.Graphics.DrawImage($img, $e.PageBounds)
  $e.HasMorePages = $false
}
$doc.add_PrintPage($handler)

try {
  $doc.Print()
  Write-Host "  Sent to '$name'."
} finally {
  $img.Dispose()
  $doc.Dispose()
}
