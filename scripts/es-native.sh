#!/usr/bin/env bash
# Isolated synthetic lab only. No system service, firewall, sysctl or sudo changes.
set -euo pipefail
action="${1:-status}"
instance="${2:-primary}"
case "$action" in setup|start|status|stop) ;; *) echo 'Invalid action' >&2; exit 1;; esac
case "$instance" in primary|dr) ;; *) echo 'Invalid instance' >&2; exit 1;; esac
[[ "$(uname -s)" == Linux ]] || { echo 'Linux runner only' >&2; exit 1; }
workspace="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
installation="$workspace/.lab/tools/elasticsearch-8.17.0"
lab_root="$workspace/.lab/es-native"
instance_root="$lab_root/$instance"
pid_file="$instance_root/node.pid"
port=19200; [[ "$instance" == dr ]] && port=19300
uri="http://127.0.0.1:$port"

live_pid() {
  curl --fail --silent --show-error --max-time 5 "$uri/_nodes/process" |
    node --input-type=module -e '
      let text=""; for await (const chunk of process.stdin) text+=chunk;
      const nodes=Object.values(JSON.parse(text).nodes || {});
      if(nodes.length!==1 || nodes[0].name!==process.argv[1] || !Number.isSafeInteger(nodes[0].process.id)) throw Error("Unexpected node identity");
      console.log(nodes[0].process.id);
    ' "drlab-$instance"
}

if [[ "$action" == setup ]]; then
  case "$(uname -m)" in x86_64) arch=x86_64;; aarch64|arm64) arch=aarch64;; *) echo 'Unsupported architecture' >&2; exit 1;; esac
  # Refuse setup while either instance is running; never overwrite its live config.
  for node in primary dr; do
    existing="$lab_root/$node/node.pid"
    if [[ -f "$existing" ]] && kill -0 "$(cat "$existing")" 2>/dev/null; then
      echo "Stop $node before setup" >&2; exit 1
    fi
  done
  mkdir -p "$workspace/.lab/tools"
  archive="elasticsearch-8.17.0-linux-$arch.tar.gz"
  cd -- "$workspace/.lab/tools"
  if [[ ! -f "$archive" ]]; then
    curl --fail --location --retry 3 --output "$archive.partial" "https://artifacts.elastic.co/downloads/elasticsearch/$archive"
    mv -- "$archive.partial" "$archive"
  fi
  curl --fail --location --retry 3 --output "$archive.sha512" "https://artifacts.elastic.co/downloads/elasticsearch/$archive.sha512"
  expected="$(awk 'NR==1 {print $1}' "$archive.sha512")"
  [[ "$expected" =~ ^[a-fA-F0-9]{128}$ ]] || { echo 'Invalid vendor checksum' >&2; exit 1; }
  printf '%s  %s\n' "$expected" "$archive" | sha512sum --check --status
  if [[ ! -d "$installation" ]]; then tar -xzf "$archive"; fi
  for node in primary dr; do
    node_root="$lab_root/$node"
    node_port=19200; [[ "$node" == dr ]] && node_port=19300
    mkdir -p "$node_root/config" "$node_root/data" "$node_root/logs" "$lab_root/snapshots"
    cp -R -- "$installation/config/." "$node_root/config/"
    # JSON quoted strings are valid YAML and preserve spaces/quotes in workspace paths.
    node --input-type=module -e '
      import fs from "node:fs";
      const [root, name, port, repo]=process.argv.slice(1);
      const config={"cluster.name":`drlab-${name}`,"node.name":`drlab-${name}`,"network.host":"127.0.0.1","http.port":Number(port),"transport.port":Number(port)+1,"discovery.type":"single-node","xpack.security.enabled":false,"xpack.ml.enabled":false,"path.data":root+"/data","path.logs":root+"/logs","path.repo":[repo]};
      fs.writeFileSync(root+"/config/elasticsearch.yml",Object.entries(config).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join("\n")+"\n");
      fs.writeFileSync(root+"/config/jvm.options.d/lab.options","-Xms512m\n-Xmx512m\n");
    ' "$node_root" "$node" "$node_port" "$lab_root/snapshots"
  done
  echo 'Verified archive and prepared two loopback-only nodes; run as a non-root user.'
elif [[ "$action" == start ]]; then
  [[ "$(id -u)" != 0 ]] || { echo 'Elasticsearch cannot run as root. Use a non-root cloud workspace; do not disable this guard.' >&2; exit 1; }
  [[ -f "$instance_root/config/elasticsearch.yml" ]] || { echo 'Run setup first' >&2; exit 1; }
  python3 "$workspace/scripts/es-start.py" "$instance"
  echo "Started $instance; readiness at $uri"
elif [[ "$action" == status ]]; then
  live="$(live_pid)"
  [[ -f "$pid_file" && "$(cat "$pid_file")" == "$live" ]] || { echo 'PID file differs from live node' >&2; exit 1; }
  echo "drlab-$instance ready; PID $live"
else
  live="$(live_pid)"
  [[ -f "$pid_file" && "$(cat "$pid_file")" == "$live" ]] || { echo 'Refusing to stop: PID mismatch' >&2; exit 1; }
  [[ "$(readlink -f "/proc/$live/exe")" == "$(readlink -f "$installation/jdk/bin/java")" ]] || { echo 'Refusing to stop: executable mismatch' >&2; exit 1; }
  tr '\0' '\n' < "/proc/$live/environ" | grep -Fx -- "ES_PATH_CONF=$instance_root/config" > /dev/null || { echo 'Refusing to stop: workspace mismatch' >&2; exit 1; }
  kill -TERM "$live"
  for ((n=0;n<60;n++)); do
    if ! kill -0 "$live" 2>/dev/null; then echo "Stopped verified $instance PID $live"; exit 0; fi
    if [[ -r "/proc/$live/stat" ]] && [[ "$(awk '{print $3}' "/proc/$live/stat")" == Z ]]; then echo "Stopped verified $instance PID $live (awaiting reaping)"; exit 0; fi
    sleep 1
  done
  echo 'Shutdown timeout; no forced kill performed' >&2; exit 1
fi
