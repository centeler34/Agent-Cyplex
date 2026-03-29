"""PCAP parsing and network anomaly detection."""

from collections import Counter
from typing import Any


def analyze_pcap(file_path: str = "", **kwargs: Any) -> dict:
    """Analyze a PCAP file for network anomalies."""
    try:
        from scapy.all import rdpcap, IP, TCP, UDP, DNS
    except ImportError:
        return {"error": "scapy not installed", "install": "pip install scapy"}

    if not file_path:
        return {"error": "file_path is required"}

    packets = rdpcap(file_path)
    total = len(packets)

    # Protocol distribution
    protocols: Counter = Counter()
    src_ips: Counter = Counter()
    dst_ips: Counter = Counter()
    dst_ports: Counter = Counter()
    dns_queries: list[str] = []

    for pkt in packets:
        if IP in pkt:
            src_ips[pkt[IP].src] += 1
            dst_ips[pkt[IP].dst] += 1

            if TCP in pkt:
                protocols["TCP"] += 1
                dst_ports[pkt[TCP].dport] += 1
            elif UDP in pkt:
                protocols["UDP"] += 1
                dst_ports[pkt[UDP].dport] += 1

            if DNS in pkt and pkt[DNS].qr == 0:
                query = pkt[DNS].qd.qname.decode("utf-8", errors="ignore")
                dns_queries.append(query)

    # Anomaly detection
    anomalies: list[str] = []

    # High volume from single source
    for ip, count in src_ips.most_common(5):
        if count > total * 0.5:
            anomalies.append(f"High traffic volume from {ip}: {count}/{total} packets")

    # Unusual ports
    suspicious_ports = {4444, 5555, 6666, 8888, 1337, 31337}
    for port in dst_ports:
        if port in suspicious_ports:
            anomalies.append(f"Traffic to suspicious port {port}: {dst_ports[port]} packets")

    return {
        "total_packets": total,
        "protocols": dict(protocols),
        "top_sources": dict(src_ips.most_common(10)),
        "top_destinations": dict(dst_ips.most_common(10)),
        "top_ports": dict(dst_ports.most_common(10)),
        "dns_queries": list(set(dns_queries))[:50],
        "anomalies": anomalies,
    }
