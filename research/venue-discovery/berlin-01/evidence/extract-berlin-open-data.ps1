param(
  [string]$InputPath = "berlin-open-data-cultural-institutions.xlsx",
  [string]$OutputPath = "berlin-open-data-music-relevant.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedInput)

function Read-ZipEntry([string]$Name) {
  $entry = $zip.Entries | Where-Object FullName -eq $Name
  if ($null -eq $entry) { throw "Missing XLSX entry $Name" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

try {
  [xml]$sharedXml = Read-ZipEntry "xl/sharedStrings.xml"
  $sharedNs = [Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
  $sharedNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $shared = @($sharedXml.SelectNodes("//x:si", $sharedNs) | ForEach-Object {
    ($_.SelectNodes(".//x:t", $sharedNs) | ForEach-Object { $_.InnerText }) -join ""
  })

  [xml]$sheetXml = Read-ZipEntry "xl/worksheets/sheet1.xml"
  $sheetNs = [Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
  $sheetNs.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $rows = @()
  foreach ($row in $sheetXml.SelectNodes("//x:sheetData/x:row", $sheetNs)) {
    $values = @{}
    foreach ($cell in $row.SelectNodes("./x:c", $sheetNs)) {
      $column = $cell.r -replace '\d', ''
      $valueNode = $cell.SelectSingleNode("./x:v", $sheetNs)
      if ($null -eq $valueNode) { $value = $null }
      elseif ($cell.t -eq "s") { $value = $shared[[int]$valueNode.InnerText] }
      else { $value = $valueNode.InnerText }
      $values[$column] = $value
    }
    if ([int]$row.r -gt 1) {
      $rows += [pscustomobject]@{
        row = [int]$row.r; name = $values.A; address = $values.B
        latitude = if ($values.C) { [double]$values.C } else { $null }
        longitude = if ($values.D) { [double]$values.D } else { $null }
        operator = $values.K; group_a = $values.L; group_b = $values.M
      }
    }
  }

  $included = @()
  $excluded = @()
  foreach ($row in $rows) {
    $groupA = [string]$row.group_a
    $groupB = [string]$row.group_b
    $musicSignal = $groupA.Trim() -match "^(B.hnen und Theater|Opern und Ch.re)$" -or
      $groupB.Trim() -match "^Spielst.ttenf.rderung$" -or
      $row.name -match "(?i)oper|musiktheater|konzerthaus|philharm"
    if ($musicSignal) {
      $included += [pscustomobject]@{
        id = "xlsx-row-$($row.row)"; name = $row.name; address = $row.address
        latitude = $row.latitude; longitude = $row.longitude
        category = "$($row.group_a) / $($row.group_b)"
        music_relevance_hint = "BROAD_CULTURAL_VENUE_SIGNAL_REQUIRES_REVIEW"
        active_status_hint = "UNKNOWN_DATASET_PUBLISHED_2016"
        evidence = @([pscustomobject]@{ kind = "BERLIN_OPEN_DATA_XLSX_ROW"; value = "sheet1!row:$($row.row)" })
      }
    } else {
      $excluded += [pscustomobject]@{ id = "xlsx-row-$($row.row)"; name = $row.name; reason = "NO_MUSIC_OR_PERFORMANCE_VENUE_SIGNAL" }
    }
  }

  $output = [pscustomobject]@{
    source_url = "https://daten.berlin.de/datensaetze/standorte-institutionell-geforderter-kultureinrichtungen"
    resource_url = "https://www.berlin.de/sen/kultur/_assets/statistiken/kultureinrichtungen_alle.xlsx"
    licence = "Creative Commons Attribution (CC BY)"
    published = "2016-09-16"
    staleness_note = "Current status is not established; every record is a discovery lead only."
    records = $included
    excluded = $excluded
  } | ConvertTo-Json -Depth 8
  $resolvedOutput = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
  [IO.File]::WriteAllText($resolvedOutput, $output, [Text.UTF8Encoding]::new($false))
} finally {
  $zip.Dispose()
}
