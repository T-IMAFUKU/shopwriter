if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "This script requires PowerShell 7+. Current: $($PSVersionTable.PSVersion)"
}
