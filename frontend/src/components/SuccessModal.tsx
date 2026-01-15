import { useEffect } from "react";
import "./SuccessModal.css";

interface SuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    message: string;
    txId?: string;
}

export const SuccessModal = ({ isOpen, onClose, message, txId }: SuccessModalProps) => {
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="success-modal-overlay" onClick={onClose}>
            <div className="success-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="success-icon">
                    <div className="checkmark-circle">
                        <svg className="checkmark" viewBox="0 0 52 52">
                            <circle className="checkmark-circle-bg" cx="26" cy="26" r="25" fill="none" />
                            <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                        </svg>
                    </div>
                </div>
                <h2 className="success-title">Success!</h2>
                <p className="success-message">{message}</p>
                {txId && (
                    <div className="success-txid">
                        <span>Transaction ID:</span>
                        <code>{txId.slice(0, 10)}...{txId.slice(-6)}</code>
                    </div>
                )}
                <button className="success-close-btn" onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
};

