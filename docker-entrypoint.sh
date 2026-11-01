#!/bin/sh
# Run the server as an unprivileged user without breaking existing installs.
#
# Started as root (the default), take ownership of /data (the only place Reel
# writes; the libraries mount is read-only and never touched), then drop to
# PUID:PGID (default 1000:1000, the image's "bun" user). Started with an
# explicit `--user`, there is nothing to fix up: just run.
set -e

if [ "$(id -u)" = "0" ]; then
  uid="${PUID:-1000}"
  gid="${PGID:-1000}"
  mkdir -p /data
  chown -R "$uid:$gid" /data
  exec su-exec "$uid:$gid" "$@"
fi

exec "$@"
