import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatAddress } from "../utils/aleo";
import "./Search.css";

interface SearchResult {
    address: string;
    name?: string;
    bio?: string;
}

export const Search = () => {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const navigate = useNavigate();

    // In a real app, this would query the blockchain
    // For now, we'll search localStorage profiles
    const searchProfiles = (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        const allKeys = Object.keys(localStorage);
        const profileKeys = allKeys.filter(key => key.startsWith("donatu_profile_"));
        const found: SearchResult[] = [];

        for (const key of profileKeys) {
            try {
                const address = key.replace("donatu_profile_", "");
                const profileData = JSON.parse(localStorage.getItem(key) || "{}");
                
                const queryLower = searchQuery.toLowerCase();
                const nameMatch = profileData.name?.toLowerCase().includes(queryLower);
                const addressMatch = address.toLowerCase().includes(queryLower);
                
                if (nameMatch || addressMatch) {
                    found.push({
                        address,
                        name: profileData.name,
                        bio: profileData.bio
                    });
                }
            } catch (e) {
                console.warn("Failed to parse profile:", e);
            }
        }

        // Also check if query is a valid address format
        if (searchQuery.startsWith("aleo1") && searchQuery.length > 10) {
            const existing = found.find(r => r.address === searchQuery);
            if (!existing) {
                // Try to load profile from localStorage if it exists
                const profileKey = `donatu_profile_${searchQuery}`;
                const profileData = localStorage.getItem(profileKey);
                let profileInfo: SearchResult = { address: searchQuery };
                
                if (profileData) {
                    try {
                        const parsed = JSON.parse(profileData);
                        profileInfo.name = parsed.name;
                        profileInfo.bio = parsed.bio;
                    } catch (e) {
                        console.warn("Failed to parse profile for address:", e);
                    }
                }
                
                found.push(profileInfo);
            }
        }

        setResults(found);
        setIsSearching(false);
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            searchProfiles(query);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query]);

    const handleResultClick = (address: string) => {
        navigate(`/profile/${address}`);
    };

    return (
        <div className="search-page fade-in">
            <div className="search-header">
                <h1>Search Users</h1>
                <p className="search-subtitle">Find users by address or nickname</p>
            </div>

            <div className="search-box glass">
                <input
                    type="text"
                    className="search-input"
                    placeholder="Enter address (aleo1...) or nickname..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {isSearching && <div className="search-spinner"></div>}
            </div>

            {results.length > 0 && (
                <div className="search-results">
                    <h2 className="results-title">Results ({results.length})</h2>
                    <div className="results-list">
                        {results.map((result) => (
                            <div
                                key={result.address}
                                className="result-card glass glass-hover"
                                onClick={() => handleResultClick(result.address)}
                            >
                                <div className="result-avatar">
                                    {result.name ? result.name.charAt(0).toUpperCase() : result.address.slice(2, 3).toUpperCase()}
                                </div>
                                <div className="result-info">
                                    <div className="result-name">
                                        {result.name || "No Name"}
                                    </div>
                                    <div className="result-address">
                                        {formatAddress(result.address)}
                                    </div>
                                    {result.bio && (
                                        <div className="result-bio">{result.bio}</div>
                                    )}
                                </div>
                                <div className="result-arrow">→</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {query && !isSearching && results.length === 0 && (
                <div className="no-results">
                    <p>No users found matching "{query}"</p>
                    <p className="no-results-hint">Try searching by address or nickname</p>
                </div>
            )}
        </div>
    );
};

