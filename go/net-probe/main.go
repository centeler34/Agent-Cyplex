// Network connectivity probe — used by Monitor Agent for infrastructure checks.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	mode := flag.String("mode", "port", "Probe mode: port, dns, banner")
	target := flag.String("target", "", "Target host or IP")
	port := flag.Int("port", 0, "Target port (for port/banner mode)")
	timeout := flag.Int("timeout", 5, "Timeout in seconds")
	jsonOutput := flag.Bool("json", false, "Output as JSON")
	flag.Parse()

	if *target == "" {
		fmt.Fprintln(os.Stderr, "Error: --target is required")
		os.Exit(1)
	}

	var result interface{}
	var err error

	switch *mode {
	case "port":
		result, err = ProbePort(*target, *port, *timeout)
	case "dns":
		result, err = ResolveDNS(*target)
	case "banner":
		result, err = GrabBanner(*target, *port, *timeout)
	default:
		fmt.Fprintf(os.Stderr, "Unknown mode: %s\n", *mode)
		os.Exit(1)
	}

	if err != nil {
		if *jsonOutput {
			json.NewEncoder(os.Stdout).Encode(map[string]interface{}{
				"error": err.Error(),
				"target": *target,
				"mode": *mode,
			})
		} else {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		}
		os.Exit(1)
	}

	if *jsonOutput {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.Encode(result)
	} else {
		fmt.Printf("%+v\n", result)
	}
}
