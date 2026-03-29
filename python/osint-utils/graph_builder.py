"""Entity relationship graph construction using networkx."""

from typing import Any


def build_graph(entities: list[dict] | None = None, relationships: list[dict] | None = None, **kwargs: Any) -> dict:
    """Build an entity relationship graph from entities and relationships."""
    try:
        import networkx as nx
    except ImportError:
        return {"error": "networkx not installed", "install": "pip install networkx"}

    entities = entities or []
    relationships = relationships or []

    G = nx.DiGraph()

    # Add nodes
    for entity in entities:
        G.add_node(
            entity["id"],
            label=entity.get("label", entity["id"]),
            type=entity.get("type", "unknown"),
            **{k: v for k, v in entity.items() if k not in ("id", "label", "type")},
        )

    # Add edges
    for rel in relationships:
        G.add_edge(
            rel["source"],
            rel["target"],
            type=rel.get("type", "related"),
            confidence=rel.get("confidence", 1.0),
            **{k: v for k, v in rel.items() if k not in ("source", "target", "type", "confidence")},
        )

    # Analysis
    result = {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "connected_components": nx.number_weakly_connected_components(G),
        "density": round(nx.density(G), 4),
        "nodes": [
            {"id": n, **G.nodes[n]}
            for n in G.nodes()
        ],
        "edges": [
            {"source": u, "target": v, **G.edges[u, v]}
            for u, v in G.edges()
        ],
    }

    # Key nodes (highest degree centrality)
    if G.number_of_nodes() > 0:
        centrality = nx.degree_centrality(G)
        top_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:10]
        result["key_nodes"] = [{"id": n, "centrality": round(c, 4)} for n, c in top_nodes]

    # Export formats
    result["export"] = {
        "graphml": nx.generate_graphml(G) if G.number_of_nodes() > 0 else "",
        "adjacency": dict(nx.to_dict_of_lists(G)),
    }

    return result
