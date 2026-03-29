"""
Forensics microservice — JSON-RPC service for PCAP, YARA, Volatility, PE analysis.
Communicates with the Node.js agent process over stdin/stdout.
"""

import json
import sys
from typing import Any

from pcap_analyzer import analyze_pcap
from yara_scanner import scan_with_yara
from volatility_bridge import analyze_memory_dump
from pefile_analyzer import analyze_pe
from entropy_analyzer import calculate_entropy


def handle_request(request: dict) -> dict:
    """Route JSON-RPC requests to the appropriate handler."""
    method = request.get("method", "")
    params = request.get("params", {})
    req_id = request.get("id", 0)

    handlers = {
        "pcap.analyze": analyze_pcap,
        "yara.scan": scan_with_yara,
        "volatility.analyze": analyze_memory_dump,
        "pefile.analyze": analyze_pe,
        "entropy.calculate": calculate_entropy,
        "ping": lambda **_: {"status": "ok", "service": "forensics"},
    }

    handler = handlers.get(method)
    if not handler:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }

    try:
        result = handler(**params)
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32000, "message": str(e)},
        }


def main():
    """Read JSON-RPC requests from stdin, write responses to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {e}"},
            }
            print(json.dumps(response), flush=True)
            continue

        response = handle_request(request)
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
