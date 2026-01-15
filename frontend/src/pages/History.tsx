import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { useDonationHistory } from "../hooks/useDonationHistory";
import { formatAddress, getProvableUrl } from "../utils/aleo";
import { DonationTransaction } from "../utils/explorerAPI";
import { ExternalLink, Send, Inbox, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import "./History.css";

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
        pending: { icon: Clock, color: 'var(--accent-blue)', bg: 'rgba(0, 212, 255, 0.1)', label: 'Pending' },
        confirmed: { icon: CheckCircle, color: 'var(--accent-cyan)', bg: 'rgba(0, 240, 255, 0.1)', label: 'Confirmed' },
        success: { icon: CheckCircle, color: 'var(--accent-cyan)', bg: 'rgba(0, 240, 255, 0.1)', label: 'Success' },
        failed: { icon: XCircle, color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.1)', label: 'Failed' },
    };

    const { icon: Icon, color, bg, label } = config[status.toLowerCase()] || config.pending;

    return (
        <span className="status-badge" style={{ color, background: bg }}>
            <Icon size={14} />
            <span>{label}</span>
        </span>
    );
}

// Helper Functions
function truncateAddress(address: string): string {
    if (!address) return "";
    if (address.length <= 14) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatAmount(amount: number): string {
    return (amount / 1_000_000).toFixed(2); // Convert from microcredits to ALEO
}

function formatTimestamp(timestamp: number): string {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

// Donation Table Component (used for both sent and received)
function DonationTable({
    donations,
    type,
}: {
    donations: DonationTransaction[];
    type: "sent" | "received";
}) {
    const navigate = useNavigate();

    return (
        <div className="donations-table-container glass">
            <table className="donations-table">
                <thead>
                    <tr>
                        <th>{type === "sent" ? "Receiver" : "Sender"}</th>
                        <th>Amount</th>
                        <th>Message</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Explorer</th>
                    </tr>
                </thead>
                <tbody>
                    {donations.map((donation) => (
                        <tr key={donation.id} className="donation-row">
                            <td>
                                <Link
                                    to={`/profile/${type === "sent" ? donation.receiver : donation.sender}`}
                                    className="address-link"
                                >
                                    {truncateAddress(type === "sent" ? donation.receiver : donation.sender)}
                                </Link>
                            </td>
                            <td className="amount-cell">
                                {formatAmount(donation.amount)} ALEO
                            </td>
                            <td className="message-cell">
                                {donation.message || "[Encrypted]"}
                            </td>
                            <td className="time-cell">
                                {formatTimestamp(donation.timestamp || 0)}
                            </td>
                            <td>
                                <StatusBadge status={donation.status || "pending"} />
                            </td>
                            <td>
                                <a
                                    href={donation.explorerUrl || getProvableUrl(donation.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="explorer-link-icon"
                                    title="View on Provable Explorer"
                                >
                                    <ExternalLink size={16} />
                                </a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export const History = () => {
    const { publicKey } = useWallet();
    const { sent, received, loading, error, refresh } = useDonationHistory(publicKey);
    const [activeTab, setActiveTab] = useState<"sent" | "received">("sent");

    // Filter and sort donations
    const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "failed">("all");
    const [sortBy, setSortBy] = useState<"date" | "amount">("date");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const activeDonations = useMemo(() => {
        let result = [...(activeTab === "sent" ? sent : received)];

        // Filter
        if (filter !== "all") {
            const filterMap: Record<string, string> = {
                pending: "pending",
                confirmed: "confirmed",
                failed: "failed",
            };
            result = result.filter((d) => (d.status || "pending").toLowerCase() === filterMap[filter]);
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === "date") {
                const aTime = a.timestamp || 0;
                const bTime = b.timestamp || 0;
                return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
            } else {
                return sortOrder === "desc" ? b.amount - a.amount : a.amount - b.amount;
            }
        });

        return result;
    }, [activeTab, sent, received, filter, sortBy, sortOrder]);

    if (!publicKey) {
        return (
            <div className="history-page">
                <div className="error-message glass">
                    <AlertCircle size={24} />
                    <span>Please connect your wallet to view donation history</span>
                </div>
            </div>
        );
    }

    return (
        <div className="history-page fade-in">
            <div className="history-header">
                <h1>Donation History</h1>
                <p className="history-subtitle">View all your sent and received donations</p>
            </div>

            <div className="tabs glass">
                <button
                    className={`tab ${activeTab === "sent" ? "active" : ""}`}
                    onClick={() => setActiveTab("sent")}
                >
                    <Send size={18} />
                    Sent Donations ({sent.length})
                </button>
                <button
                    className={`tab ${activeTab === "received" ? "active" : ""}`}
                    onClick={() => setActiveTab("received")}
                >
                    <Inbox size={18} />
                    Received Donations ({received.length})
                </button>
            </div>

            {/* Filters and Sort */}
            <div className="history-controls glass">
                <div className="filter-group">
                    <label>Filter:</label>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="filter-select"
                    >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
                <div className="sort-group">
                    <label>Sort by:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="sort-select"
                    >
                        <option value="date">Date</option>
                        <option value="amount">Amount</option>
                    </select>
                    <button
                        className="sort-order-btn"
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
                    >
                        {sortOrder === "asc" ? "↑" : "↓"}
                    </button>
                </div>
                <button className="refresh-btn" onClick={refresh} disabled={loading}>
                    {loading ? "⟳" : "↻"} Refresh
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="error-banner glass">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button onClick={refresh} className="retry-btn">
                        Retry
                    </button>
                </div>
            )}

            {/* Loading State */}
            {loading && activeDonations.length === 0 && (
                <div className="loading-state">
                    <div className="skeleton-loader">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="skeleton-row" />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && activeDonations.length === 0 && activeTab === "sent" && (
                <div className="empty-state glass">
                    <Send size={48} className="empty-icon" />
                    <h3>No donations sent yet</h3>
                    <p>Start supporting creators by sending your first donation</p>
                </div>
            )}

            {!loading && activeDonations.length === 0 && activeTab === "received" && (
                <div className="empty-state glass">
                    <Inbox size={48} className="empty-icon" />
                    <h3>No donations received yet</h3>
                    <p>Share your profile to start receiving donations</p>
                </div>
            )}

            {/* Donation Table */}
            {!loading && activeDonations.length > 0 && (
                <DonationTable donations={activeDonations} type={activeTab} />
            )}
        </div>
    );
};
