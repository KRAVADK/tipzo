import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork, Transaction } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from "../deployed_program";
import { formatAddress, fieldToString } from "../utils/aleo";
import { requestTransactionWithRetry } from "../utils/walletUtils";
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
    const { publicKey, wallet } = useWallet();
    const adapter = wallet?.adapter as any;
    const network = WalletAdapterNetwork.TestnetBeta;

    // Search profiles - uses localStorage for name search, blockchain for address lookup
    const searchProfiles = async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        const found: SearchResult[] = [];

        try {
            // Search in localStorage (profiles are cached there after creation/update)
            const allKeys = Object.keys(localStorage);
            const profileKeys = allKeys.filter(key => key.startsWith("tipzo_profile_"));
            
            const queryLower = searchQuery.toLowerCase();

            for (const key of profileKeys) {
                try {
                    const address = key.replace("tipzo_profile_", "");
                    const profileData = JSON.parse(localStorage.getItem(key) || "{}");
                    
                    // Only show public profiles in search (unless searching by exact address)
                    const isPublic = profileData.is_public !== false; // Default to true if not set
                    if (!isPublic && !searchQuery.startsWith("aleo1")) {
                        continue; // Skip private profiles unless searching by address
                    }
                    
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

            // If query is a valid address, try to fetch from blockchain if not found in localStorage
            if (searchQuery.startsWith("aleo1") && searchQuery.length > 10) {
                const existing = found.find(r => r.address === searchQuery);
                if (!existing) {
                    // Try to load from localStorage first
                    const profileKey = `tipzo_profile_${searchQuery}`;
                    const profileData = localStorage.getItem(profileKey);
                    
                    if (profileData) {
                        try {
                            const parsed = JSON.parse(profileData);
                            found.push({
                                address: searchQuery,
                                name: parsed.name,
                                bio: parsed.bio
                            });
                        } catch (e) {
                            console.warn("Failed to parse profile for address:", e);
                        }
                    } else {
                        // Try to fetch from blockchain using get_profile view function
                        // Note: This requires a transaction, so we'll just add the address
                        // The profile will be loaded when user clicks on it
                        found.push({
                            address: searchQuery,
                            name: undefined, // Will be loaded from blockchain when viewing profile
                            bio: undefined
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("Search error:", e);
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
                <p className="search-hint" style={{ fontSize: "0.9em", opacity: 0.7, marginTop: "0.5em" }}>
                    Profiles are searched from local cache. Enter an address to view any profile.
                </p>
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
                    <p className="no-results-hint">
                        {query.startsWith("aleo1") 
                            ? "You can still view this profile by clicking the address"
                            : "Try searching by address (aleo1...) or nickname"}
                    </p>
                </div>
            )}
        </div>
    );
};
