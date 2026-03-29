"""crt.sh certificate transparency scraper."""

import json
import urllib.request
from typing import Any


def search_crtsh(domain: str = "", **kwargs: Any) -> dict:
    """Query crt.sh for certificates issued for a domain and its subdomains."""
    if not domain:
        return {"error": "domain is required"}

    url = f"https://crt.sh/?q=%.{domain}&output=json"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AgentCyplex-OSINT/0.1"})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode())

        # Extract unique domain names
        subdomains: set[str] = set()
        certs: list[dict] = []

        for entry in data:
            name_value = entry.get("name_value", "")
            for name in name_value.split("\n"):
                name = name.strip().lower()
                if name and "*" not in name:
                    subdomains.add(name)

            certs.append({
                "id": entry.get("id"),
                "issuer": entry.get("issuer_name", ""),
                "name_value": name_value,
                "not_before": entry.get("not_before"),
                "not_after": entry.get("not_after"),
            })

        return {
            "domain": domain,
            "total_certs": len(data),
            "unique_subdomains": sorted(subdomains),
            "subdomain_count": len(subdomains),
            "recent_certs": certs[:20],
        }

    except Exception as e:
        return {"error": f"crt.sh query failed: {e}"}
