#!/usr/bin/env python3
"""
ea-central desktop bridge
=========================

Runs on the mentor's or client's Windows PC alongside MetaTrader 5 (and later MT4).
- Pairs once with ea-central using your email + licence key.
- Polls ea-central every 3 seconds for new trade signals from your mentor's PC bot.
- Executes BUY / SELL / CLOSE orders directly into your MT5 terminal.

Requirements (Windows + Python 3.10+):
    pip install MetaTrader5 requests

Run:
    python ea_central_bridge.py
"""
import json
import os
import sys
import time
import platform
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: please run  `pip install requests`  first.")
    sys.exit(1)

# MT5 is optional at import time so the script can do the pairing step on any OS.
try:
    import MetaTrader5 as mt5
    HAVE_MT5 = True
except ImportError:
    HAVE_MT5 = False

CONFIG_PATH = Path.home() / ".ea-central-bridge.json"
API_BASE = os.environ.get("EA_CENTRAL_API", "https://api.ea-central.co/api")
POLL_INTERVAL = 3
ACTION_BUY, ACTION_SELL, ACTION_CLOSE = "BUY", "SELL", "CLOSE"


# ------------------------- config -------------------------
def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    print(f"  config saved: {CONFIG_PATH}")


def pair_interactive() -> dict:
    print("\n=== ea-central bridge pairing ===")
    email = input("  Your ea-central email: ").strip().lower()
    license_key = input("  Licence key (EAC-XXXX-XXXX-XXXX-XXXX): ").strip().upper()
    platform_kind = input("  Platform [mt5 / mt4] (default mt5): ").strip().lower() or "mt5"
    machine = platform.node()[:80]

    r = requests.post(f"{API_BASE}/bridge/pair", json={
        "email": email,
        "license_key": license_key,
        "platform": platform_kind,
        "machine_name": machine,
    }, timeout=15)
    if r.status_code != 200:
        print(f"  pairing failed: HTTP {r.status_code} — {r.text}")
        sys.exit(1)
    data = r.json()
    cfg = {
        "email": email,
        "license_key": license_key,
        "platform": platform_kind,
        "bridge_token": data["bridge_token"],
        "ea_name": data.get("ea_name"),
        "ea_id": data.get("ea_id"),
    }
    save_config(cfg)
    print(f"  paired with EA: {cfg['ea_name']}")
    return cfg


# ------------------------- MT5 helpers -------------------------
def mt5_login(creds: dict) -> bool:
    if not HAVE_MT5:
        print("  [skip] MetaTrader5 package not installed — cannot execute trades. "
              "Run `pip install MetaTrader5` on Windows.")
        return False
    if not mt5.initialize():
        print(f"  MT5 initialize failed: {mt5.last_error()}")
        return False
    ok = mt5.login(
        login=int(creds["account"]),
        password=creds["password"],
        server=creds["server"],
    )
    if not ok:
        print(f"  MT5 login failed: {mt5.last_error()}")
        return False
    print(f"  MT5 logged in: {creds['server']} #{creds['account']}")
    return True


def mt5_execute(job: dict) -> dict:
    if not HAVE_MT5:
        return {"status": "skipped", "error": "MetaTrader5 package not installed"}

    symbol = job["symbol"]
    action = job["action"]
    lot = float(job["lot"])

    # Make sure symbol is selected in Market Watch
    if not mt5.symbol_select(symbol, True):
        return {"status": "failed", "error": f"symbol_select({symbol}) failed"}

    if action == ACTION_CLOSE:
        positions = mt5.positions_get(symbol=symbol) or []
        closed = []
        for p in positions:
            close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
            tick = mt5.symbol_info_tick(symbol)
            price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": p.volume,
                "type": close_type,
                "position": p.ticket,
                "price": price,
                "deviation": 20,
                "magic": 9090,
                "comment": "ea-central close",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            res = mt5.order_send(req)
            closed.append({"ticket": p.ticket, "retcode": res.retcode if res else None})
        return {"status": "executed", "mt_order_id": ",".join(str(c["ticket"]) for c in closed) or None,
                "raw": {"closed": closed}}

    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        return {"status": "failed", "error": f"no tick for {symbol}"}
    order_type = mt5.ORDER_TYPE_BUY if action == ACTION_BUY else mt5.ORDER_TYPE_SELL
    price = tick.ask if action == ACTION_BUY else tick.bid

    req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": lot,
        "type": order_type,
        "price": price,
        "deviation": 20,
        "magic": 9090,
        "comment": (job.get("comment") or "ea-central")[:30],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    if job.get("stop_loss"):
        req["sl"] = float(job["stop_loss"])
    if job.get("take_profit"):
        req["tp"] = float(job["take_profit"])

    res = mt5.order_send(req)
    if not res or res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"status": "failed", "error": f"retcode={res.retcode if res else 'None'}",
                "raw": {"comment": getattr(res, 'comment', None)}}
    return {"status": "executed", "mt_order_id": str(res.order), "raw": {"price": res.price, "volume": res.volume}}


# ------------------------- bridge loop -------------------------
def poll_loop(cfg: dict):
    headers = {"Authorization": f"Bearer {cfg['bridge_token']}"}
    mt5_session_ready = False
    print(f"  polling {API_BASE}/bridge/jobs every {POLL_INTERVAL}s …\n")
    while True:
        try:
            r = requests.get(f"{API_BASE}/bridge/jobs", headers=headers, timeout=10)
            if r.status_code == 401:
                print("  bridge token rejected — re-run with --pair")
                sys.exit(2)
            r.raise_for_status()
            data = r.json()
            broker = data.get("broker")
            jobs = data.get("jobs", [])

            if jobs and broker and not mt5_session_ready:
                mt5_session_ready = mt5_login(broker)

            for job in jobs:
                ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
                print(f"  [{ts}] job {job['id'][:8]} {job['action']} {job['symbol']} lot={job['lot']}")
                outcome = mt5_execute(job) if mt5_session_ready else {
                    "status": "skipped",
                    "error": "broker not connected — set credentials in /app",
                }
                requests.post(
                    f"{API_BASE}/bridge/jobs/{job['id']}/ack",
                    headers=headers,
                    json=outcome,
                    timeout=10,
                )
                print(f"    -> {outcome['status']} {outcome.get('mt_order_id') or outcome.get('error') or ''}")
        except KeyboardInterrupt:
            print("\n  bye.")
            return
        except Exception as e:
            print(f"  poll error: {e}")
        time.sleep(POLL_INTERVAL)


# ------------------------- main -------------------------
def main():
    cfg = load_config()
    if "--pair" in sys.argv or not cfg.get("bridge_token"):
        cfg = pair_interactive()
    print(f"  ea-central bridge — EA: {cfg.get('ea_name')} — machine: {platform.node()}")
    poll_loop(cfg)


if __name__ == "__main__":
    main()
