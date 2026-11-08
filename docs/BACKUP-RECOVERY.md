# Backup, retention and recovery

A recoverable backup set includes the PostgreSQL dump, private encrypted file-storage directory, required historical KEK versions held separately in a secrets manager, and the application release/migration version. A database-only dump is insufficient because file blobs are stored separately.

## Manual local backup

Use a protected directory on an encrypted disk. Do not store backups in the repository or web-served directories.

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "D:\vaultshare-backups\$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
pg_dump "$env:DATABASE_URL" --format=custom --file "$backup\vaultshare.dump"
robocopy "$env:STORAGE_PATH" "$backup\private-storage" /E /COPY:DAT /R:2 /W:2
if ($LASTEXITCODE -ge 8) { throw "Storage backup failed" }
```

Never copy KEKs into the backup directory. Keep historical KEKs available for every retained backup.

## Restore drill

Restore into an isolated database and isolated storage directory. Use pg_restore with the matching dump, restore the matching encrypted blobs, configure the historical KEKs, then verify row counts, active-file/blob correspondence, representative vault/file decryption, and cleanup-job consistency. Record backup ID, operator, duration, and outcome.

## Retention and deletion limits

Until a production retention policy is selected, backups are manual and require operator-managed retention and deletion. Live-system deletion does not erase historical backup copies. Do not claim backup erasure from account deletion or vault destruction. Production requires tested RPO/RTO, encryption at rest, access control, retention, deletion propagation, and periodic restore drills. Check actual pricing before enabling paid backup services; the zero-personal-cost V1 constraint remains.
