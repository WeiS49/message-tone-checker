#!/bin/zsh

set -u
unsetopt BG_NICE

PROJECT_DIR="${0:A:h}"
PORT=3000
URL="http://127.0.0.1:${PORT}"
SERVER_PID=""

pause_after_error() {
  printf "\nPress Return to close this window."
  read -r
}

port_is_busy() {
  /usr/sbin/lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

listener_is_from_this_project() {
  local pid process_dir

  for pid in $(/usr/sbin/lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null); do
    process_dir="$(/usr/sbin/lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')"
    if [[ "${process_dir}" == "${PROJECT_DIR}" ]]; then
      return 0
    fi
  done
  return 1
}

jev_is_ready() {
  /usr/bin/curl --fail --silent --max-time 1 "${URL}" 2>/dev/null | /usr/bin/grep -qi "Jev"
}

stop_server() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null
    wait "${SERVER_PID}" 2>/dev/null
  fi
  SERVER_PID=""
}

handle_signal() {
  printf "\nStopping Jev...\n"
  stop_server
  exit 0
}

cd "${PROJECT_DIR}" || {
  echo "Could not open the Jev project folder: ${PROJECT_DIR}"
  pause_after_error
  exit 1
}

if port_is_busy; then
  if listener_is_from_this_project && jev_is_ready; then
    echo "Jev is already running at ${URL}"
    /usr/bin/open "${URL}"
    exit 0
  fi

  echo "Port ${PORT} is already in use, so Jev was not started."
  echo "Close the other app using that port, then double-click start.command again."
  echo "No process was stopped."
  pause_after_error
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is not installed or is not available in Terminal."
  echo "Install Bun from https://bun.sh/docs/installation, then double-click this file again."
  pause_after_error
  exit 1
fi

trap stop_server EXIT
trap handle_signal HUP INT TERM

echo "Starting Jev..."
PORT=3000 bun --hot server.ts &
SERVER_PID=$!

for attempt in {1..150}; do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    wait "${SERVER_PID}" 2>/dev/null
    SERVER_PID=""
    echo "Jev stopped before it became ready. Review the message above, then try again."
    pause_after_error
    exit 1
  fi

  if jev_is_ready; then
    echo "Jev is ready at ${URL}"
    if ! /usr/bin/open "${URL}"; then
      echo "The browser did not open automatically. Open ${URL} yourself."
    fi
    echo "Keep this window open while you use Jev. Press Control-C to stop it."
    wait "${SERVER_PID}"
    jev_exit_code=$?
    SERVER_PID=""
    exit "${jev_exit_code}"
  fi

  /bin/sleep 0.2
done

echo "Jev did not become ready within 30 seconds."
stop_server
pause_after_error
exit 1
