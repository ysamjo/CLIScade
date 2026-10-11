"""Startet den CLIScade losgeloest von der aufrufenden Shell.

Aufruf:  python3 tools/start-detached.py

Warum nicht `nohup node server.js &`: der Aufrufer raeumt am Ende seine
Prozessgruppe ab, und nohup hilft nur gegen SIGHUP. `start_new_session=True`
setzt setsid — der Server wird Session-Leader und ueberlebt das Aufraeumen.

Genauso wichtig ist die Umgebung. Wird der Server aus einer Agent-Session der
WorkBuddy-App gestartet, erbt er deren Geruest, und das bringt ihn um:

  NODE_OPTIONS=--require=.../node-language-shim.cjs
      laedt node-brokered-fs-shim.cjs. Jeder fs-Aufruf geht dann ueber den
      Sandbox-Broker der App. Faellt der Broker weg (Ende des Agenten-Zugs),
      wirft der naechste Dateizugriff "Connection refused" — und zwar als
      unbehandelte Ausnahme. Der Server stirbt dann mitten im Betrieb, auch
      beim blossen Ausliefern einer statischen Datei.

  PATH mit .../cli/vendor/shim/brokered-bin
      biegt node, rm, sh und Co. auf Shim-Wrapper um.

  BASH_ENV, PYTHONPATH, CODEBUDDY_*, WORKBUDDY_*
      dasselbe Geruest in anderen Sprachen.

  SERVER__PORT, SERVER__HOST
      der Web-UI-Port der App. Bleibt er in der Umgebung, bindet jeder dispatchte
      Harness denselben Port — codebuddy bricht dann sofort ab mit
      "listen EADDRINUSE: address already in use 127.0.0.1:54968".

Deshalb: Denylist fuer die bekannten Marker, Praefixe fuer die Namen, die je
App-Version wechseln, und der PATH wird von Shim-Eintraegen befreit.
ANTHROPIC_*/CLAUDE_*/QODER_* fliegen ebenfalls raus — die Gateway-Umbiegung
holt sich der Server selbst aus der Login-Shell, und QODER_* vergiftet jedes
qodercli mit sdk_invalid_args.
"""
import datetime
import os
import subprocess
import sys
import shutil
from pathlib import Path

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LOG = os.environ.get("HARNESS_LOG") or "/tmp/cliscade.log"

# Namen, die genau so weg muessen.
ZU_ENTFERNEN = (
    "NODE_OPTIONS",      # --require node-language-shim.cjs
    "BASH_ENV",
    "PYTHONPATH",
    # Web-UI-Port der App. Erbt ihn ein dispatchter Harness, bindet er denselben
    # Port und stirbt mit "EADDRINUSE 127.0.0.1:54968" (gemessen 2026-10-10).
    "SERVER__PORT",
    "SERVER__HOST",
    "__CFBundleIdentifier",
    "ACC_PRODUCT_CONFIG_PATH",
    "PENDING_TELEMETRY_DIR",
    "GENIE_TRASH_DIR",
    "BAGGAGE",
    # Gateway des aufrufenden Agenten — der Server holt es sich selbst.
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "CLAUDE_PROJECT_DIR",
    "CLAUDE_SESSION_ID",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
)

# Praefixe: die Namen wechseln je App-Version, der Hersteller bleibt.
ZU_ENTFERNEN_PRAEFIX = (
    "QODER",            # Marker -> qodercli bricht mit sdk_invalid_args ab
    "CODEBUDDY",
    "WORKBUDDY",
    "SANDBOX_CENTER",
    "CLIENT_INFO",
    "INSTALL_",
    "BACKUP_APP_PATH",
    "NEW_APP_PATH",
    "CURRENT_APP_PATH",
    "TARGET_BUNDLE_ID",
)

# Shim-Eintraege im PATH aussortieren.
SHIM_MARKER = "cli/vendor/shim"


def sauberer_path(wert):
    teile = [t for t in (wert or "").split(":") if t and SHIM_MARKER not in t]
    # Die Standardpfade muessen bleiben, egal was die Session mitgebracht hat.
    for p in (str(Path.home() / ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"):
        if p not in teile:
            teile.insert(0, p)
    for p in ("/usr/bin", "/bin", "/usr/sbin", "/sbin"):
        if p not in teile:
            teile.append(p)
    return ":".join(teile)


def find_node(environment):
    configured = environment.get("HARNESS_NODE")
    candidates = [configured] if configured else [shutil.which("node", path=environment["PATH"])]
    if not configured:
        candidates += [str(p) for p in sorted((Path.home() / ".nvm/versions/node").glob("*/bin/node"), reverse=True)]
    for candidate in candidates:
        if not candidate or not os.access(candidate, os.X_OK):
            continue
        try:
            version = subprocess.check_output([candidate, "--version"], env=environment, timeout=5, stderr=subprocess.DEVNULL).decode().strip().lstrip("v")
            if tuple(int(part) for part in version.split(".")[:2]) >= (22, 13):
                return candidate
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
    if not configured:
        try:
            shell = environment.get("SHELL", "/bin/zsh")
            output = subprocess.check_output([shell, "-lic", "/usr/bin/env"], env=environment, timeout=6, stderr=subprocess.DEVNULL).decode()
            shell_path = next((line[5:] for line in output.splitlines() if line.startswith("PATH=")), "")
            candidate = shutil.which("node", path=sauberer_path(shell_path))
            if candidate:
                return find_node({**environment, "HARNESS_NODE": candidate})
        except (OSError, subprocess.SubprocessError):
            pass
    raise RuntimeError("Node.js ab 22.13 fehlt. Node installieren oder HARNESS_NODE auf eine passende Version setzen.")


def main():
    umgebung = {
        k: v for k, v in os.environ.items()
        if k not in ZU_ENTFERNEN and not k.startswith(ZU_ENTFERNEN_PRAEFIX)
    }
    umgebung["PATH"] = sauberer_path(umgebung.get("PATH"))

    # Nachweis: was das Geruest war, darf hier nicht mehr stehen.
    verdacht = sorted(
        k for k in umgebung
        if k.startswith(("CODEBUDDY", "WORKBUDDY", "QODER", "SANDBOX_CENTER"))
        or k in ("NODE_OPTIONS", "BASH_ENV")
    )
    if verdacht:
        print("WARNUNG, Geruest noch in der Umgebung:", ", ".join(verdacht), file=sys.stderr)
    if SHIM_MARKER in umgebung["PATH"]:
        print("WARNUNG, Shim noch im PATH", file=sys.stderr)

    try:
        node = find_node(umgebung)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

    log = open(LOG, "ab", buffering=0)
    log.write(b"\n=== Start %s ===\n" % datetime.datetime.now().isoformat().encode())

    prozess = subprocess.Popen(
        [node, "server.js"],
        cwd=REPO,
        env=umgebung,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

    print("pid", prozess.pid)
    sys.exit(0)

if __name__ == "__main__":
    main()
