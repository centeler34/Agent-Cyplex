package main

import (
	"net"
)

// DNSResult holds DNS resolution results.
type DNSResult struct {
	Host    string   `json:"host"`
	IPs     []string `json:"ips"`
	CNAME   string   `json:"cname,omitempty"`
	MX      []string `json:"mx,omitempty"`
	TXT     []string `json:"txt,omitempty"`
	NS      []string `json:"ns,omitempty"`
}

// ResolveDNS performs a comprehensive DNS lookup on the target.
func ResolveDNS(host string) (*DNSResult, error) {
	result := &DNSResult{Host: host}

	// A/AAAA records
	ips, err := net.LookupHost(host)
	if err == nil {
		result.IPs = ips
	}

	// CNAME
	cname, err := net.LookupCNAME(host)
	if err == nil && cname != host+"." {
		result.CNAME = cname
	}

	// MX records
	mxRecords, err := net.LookupMX(host)
	if err == nil {
		for _, mx := range mxRecords {
			result.MX = append(result.MX, mx.Host)
		}
	}

	// TXT records
	txtRecords, err := net.LookupTXT(host)
	if err == nil {
		result.TXT = txtRecords
	}

	// NS records
	nsRecords, err := net.LookupNS(host)
	if err == nil {
		for _, ns := range nsRecords {
			result.NS = append(result.NS, ns.Host)
		}
	}

	return result, nil
}
